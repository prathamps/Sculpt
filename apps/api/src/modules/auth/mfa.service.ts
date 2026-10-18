import bcrypt from "bcrypt"
import { createHash, randomBytes } from "crypto"
import { User, UserRole } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, ValidationError } from "../../lib/errors"
import { openSecret, sealSecret } from "../../lib/secret-box"
import { base32Encode, generateTotpSecret, matchingTotpStep, otpauthUri } from "../../lib/totp"
import { recordAudit } from "../audit/audit.service"
import { forgetCachedSessions } from "./session.service"
import { endDelegatedAccess } from "../oauth/credential-changes"

const MFA_ISSUER = "Sculpt"
const RECOVERY_CODE_COUNT = 10
const RECOVERY_CODE_BYTES = 8

export interface SecondFactor {
	code?: string
	recoveryCode?: string
}

export interface MfaStatus {
	enabled: boolean
	enabledAt: Date | null
	recoveryCodesRemaining: number
	required: boolean
}

const flagFromEnv = (variable: string, fallback: boolean): boolean => {
	const raw = process.env[variable]?.trim().toLowerCase()
	if (!raw) return fallback
	return raw === "true" || raw === "1" || raw === "yes"
}

export const adminMfaRequired = (): boolean => flagFromEnv("ADMIN_MFA_REQUIRED", true)

export const everyoneMfaRequired = (): boolean => flagFromEnv("MFA_REQUIRED", false)

export const mfaRequiredFor = (user: Pick<User, "role">): boolean =>
	everyoneMfaRequired() || (user.role === UserRole.ADMIN && adminMfaRequired())

export const hasMfa = (user: Pick<User, "totpEnabledAt">): boolean => !!user.totpEnabledAt

const normalizeRecoveryCode = (code: string): string =>
	code.toUpperCase().replace(/[^A-Z2-7]/g, "")

const hashRecoveryCode = (code: string): string =>
	createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex")

const formatRecoveryCode = (raw: string): string => `${raw.slice(0, 5)}-${raw.slice(5, 10)}`

const issueRecoveryCodes = async (userId: string): Promise<string[]> => {
	const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
		formatRecoveryCode(base32Encode(randomBytes(RECOVERY_CODE_BYTES)))
	)
	await prisma.$transaction([
		prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
		prisma.mfaRecoveryCode.createMany({
			data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
		}),
	])
	return codes
}

const userWithSecrets = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: { password: false, totpSecret: false, totpPendingSecret: false },
	})
	if (!user) throw new ValidationError("User not found.")
	return user
}

export const mfaStatus = async (userId: string): Promise<MfaStatus> => {
	const user = await userWithSecrets(userId)
	const recoveryCodesRemaining = await prisma.mfaRecoveryCode.count({
		where: { userId, usedAt: null },
	})
	return {
		enabled: hasMfa(user),
		enabledAt: user.totpEnabledAt,
		recoveryCodesRemaining,
		required: mfaRequiredFor(user),
	}
}

export const beginEnrollment = async (
	userId: string
): Promise<{ secret: string; otpauthUri: string }> => {
	const user = await userWithSecrets(userId)
	if (hasMfa(user)) {
		throw new ValidationError("Two-factor authentication is already on.")
	}
	const secret = generateTotpSecret()
	await prisma.user.update({
		where: { id: userId },
		data: { totpPendingSecret: sealSecret(secret) },
	})
	return { secret, otpauthUri: otpauthUri(MFA_ISSUER, user.email, secret) }
}

export const completeEnrollment = async (
	userId: string,
	code: string,
	now = Date.now()
): Promise<string[]> => {
	const user = await userWithSecrets(userId)
	if (!user.totpPendingSecret) {
		throw new ValidationError("Start two-factor setup first.")
	}
	const secret = openSecret(user.totpPendingSecret)
	const step = matchingTotpStep(secret, code, now, null)
	if (step === null) {
		throw new ValidationError("That code did not match. Check your authenticator app's clock and try again.")
	}

	await prisma.user.update({
		where: { id: userId },
		data: {
			totpSecret: user.totpPendingSecret,
			totpPendingSecret: null,
			totpEnabledAt: new Date(now),
			totpLastStep: step,
			tokenVersion: { increment: 1 },
		},
	})
	forgetCachedSessions(userId)
	await endDelegatedAccess(userId, "mfa_enabled")
	const codes = await issueRecoveryCodes(userId)
	await recordAudit({ action: "user.mfa_enabled", targetType: "user", targetId: userId, actorId: userId })
	return codes
}

export const verifySecondFactor = async (
	userId: string,
	factor: SecondFactor,
	now = Date.now()
): Promise<"totp" | "recovery_code" | null> => {
	const user = await userWithSecrets(userId)
	if (!user.totpSecret) return null

	if (factor.code) {
		const step = matchingTotpStep(openSecret(user.totpSecret), factor.code, now, user.totpLastStep)
		if (step === null) return null
		const claimed = await prisma.user.updateMany({
			where: {
				id: userId,
				OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
			},
			data: { totpLastStep: step },
		})
		return claimed.count === 1 ? "totp" : null
	}

	if (factor.recoveryCode) {
		const consumed = await prisma.mfaRecoveryCode.updateMany({
			where: { userId, codeHash: hashRecoveryCode(factor.recoveryCode), usedAt: null },
			data: { usedAt: new Date(now) },
		})
		if (consumed.count !== 1) return null
		await recordAudit({
			action: "user.mfa_recovery_code_used",
			targetType: "user",
			targetId: userId,
			actorId: userId,
		})
		return "recovery_code"
	}

	return null
}

export const requireSecondFactor = async (userId: string, factor: SecondFactor): Promise<void> => {
	if (!(await verifySecondFactor(userId, factor))) {
		await recordAudit({
			action: "user.mfa_challenge_failed",
			targetType: "user",
			targetId: userId,
			actorId: userId,
		})
		throw new ForbiddenError("That two-factor code is not valid.")
	}
}

export const regenerateRecoveryCodes = async (
	userId: string,
	factor: SecondFactor
): Promise<string[]> => {
	await requireSecondFactor(userId, factor)
	const codes = await issueRecoveryCodes(userId)
	await recordAudit({
		action: "user.mfa_recovery_codes_regenerated",
		targetType: "user",
		targetId: userId,
		actorId: userId,
	})
	return codes
}

export const disableMfa = async (
	userId: string,
	factor: SecondFactor & { password?: string }
): Promise<void> => {
	const user = await userWithSecrets(userId)
	if (!hasMfa(user)) return
	if (mfaRequiredFor(user)) {
		throw new ForbiddenError("Two-factor authentication is required for your account and cannot be turned off.")
	}
	if (user.password && !(factor.password && (await bcrypt.compare(factor.password, user.password)))) {
		throw new ForbiddenError("Your current password is incorrect.")
	}
	await requireSecondFactor(userId, factor)

	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: {
				totpSecret: null,
				totpPendingSecret: null,
				totpEnabledAt: null,
				totpLastStep: null,
				tokenVersion: { increment: 1 },
			},
		}),
		prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
	])
	forgetCachedSessions(userId)
	await endDelegatedAccess(userId, "mfa_disabled")
	await recordAudit({ action: "user.mfa_disabled", targetType: "user", targetId: userId, actorId: userId })
}
