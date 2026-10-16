import bcrypt from "bcrypt"
import { randomBytes } from "crypto"
import { User } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { recordAudit } from "../audit/audit.service"

const DEFAULT_MAX_FAILED_ATTEMPTS = 10
const DEFAULT_LOCKOUT_MINUTES = 15
export const PASSWORD_HASH_ROUNDS = 10

let timingEqualizerHash: Promise<string> | null = null

const hashOfNothing = (): Promise<string> =>
	(timingEqualizerHash ??= bcrypt.hash(
		randomBytes(16).toString("hex"),
		PASSWORD_HASH_ROUNDS
	))

const positiveNumberFromEnv = (variable: string, fallback: number): number => {
	const value = Number(process.env[variable])
	return Number.isFinite(value) && value > 0 ? value : fallback
}

export const maxFailedAttempts = (): number =>
	positiveNumberFromEnv("LOGIN_MAX_FAILED_ATTEMPTS", DEFAULT_MAX_FAILED_ATTEMPTS)

export const lockoutMinutes = (): number =>
	positiveNumberFromEnv("LOGIN_LOCKOUT_MINUTES", DEFAULT_LOCKOUT_MINUTES)

export type CredentialCheck =
	| { outcome: "valid"; user: User }
	| { outcome: "invalid"; userId: string | null }
	| { outcome: "locked"; lockedUntil: Date }

export const isLocked = (
	user: Pick<User, "lockedUntil">,
	now = new Date()
): boolean => !!user.lockedUntil && user.lockedUntil > now

export const recordFailedAttempt = async (
	userId: string,
	now = new Date()
): Promise<Date | null> => {
	const updated = await prisma.user.update({
		where: { id: userId },
		data: { failedLoginCount: { increment: 1 } },
		select: { failedLoginCount: true },
	})
	if (updated.failedLoginCount < maxFailedAttempts()) return null

	const lockedUntil = new Date(now.getTime() + lockoutMinutes() * 60000)
	await prisma.user.update({
		where: { id: userId },
		data: { failedLoginCount: 0, lockedUntil },
	})
	await recordAudit({
		action: "user.login_locked_out",
		targetType: "user",
		targetId: userId,
		metadata: { lockedUntil: lockedUntil.toISOString() },
	})
	return lockedUntil
}

export const clearFailedAttempts = async (user: Pick<User, "id" | "failedLoginCount" | "lockedUntil">): Promise<void> => {
	if (user.failedLoginCount === 0 && !user.lockedUntil) return
	await prisma.user.update({
		where: { id: user.id },
		data: { failedLoginCount: 0, lockedUntil: null },
	})
}

export const checkPassword = async (
	email: string,
	password: string,
	now = new Date()
): Promise<CredentialCheck> => {
	const user = await prisma.user.findUnique({
		where: { email },
		omit: { password: false },
	})

	if (!user?.password) {
		await bcrypt.compare(password, await hashOfNothing())
		return { outcome: "invalid", userId: null }
	}

	if (isLocked(user, now)) {
		return { outcome: "locked", lockedUntil: user.lockedUntil as Date }
	}

	if (!(await bcrypt.compare(password, user.password))) {
		const lockedUntil = await recordFailedAttempt(user.id, now)
		return lockedUntil
			? { outcome: "locked", lockedUntil }
			: { outcome: "invalid", userId: user.id }
	}

	return { outcome: "valid", user }
}

export const lockedOutMessage = (lockedUntil: Date, now = new Date()): string => {
	const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000))
	return `Too many failed attempts on this account. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}
