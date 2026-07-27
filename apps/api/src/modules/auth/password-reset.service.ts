import bcrypt from "bcrypt"
import { createHash, randomBytes } from "crypto"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { ValidationError } from "../../lib/errors"
import { sendPasswordResetEmail } from "../notifications/email.service"

const RESET_TOKEN_TTL_MS = 3600000
const PASSWORD_HASH_ROUNDS = 10

const hashToken = (token: string): string =>
	createHash("sha256").update(token).digest("hex")

const resetUrl = (token: string): string => {
	const base = (
		process.env.FRONTEND_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		"http://localhost:3000"
	).replace(/\/+$/, "")
	return `${base}/reset-password?token=${encodeURIComponent(token)}`
}

export const requestPasswordReset = async (email: string): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { email },
		omit: { password: false },
	})

	if (!user?.password) {
		logger.info("Password reset requested for an unusable account", {
			hasAccount: !!user,
		})
		return
	}

	const token = randomBytes(32).toString("hex")

	await prisma.passwordResetToken.create({
		data: {
			tokenHash: hashToken(token),
			userId: user.id,
			expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
		},
	})

	await sendPasswordResetEmail({
		to: user.email,
		name: user.name,
		resetUrl: resetUrl(token),
	})
}

export const completePasswordReset = async (
	token: string,
	newPassword: string
): Promise<string> => {
	const record = await prisma.passwordResetToken.findUnique({
		where: { tokenHash: hashToken(token) },
	})

	if (!record || record.usedAt || record.expiresAt < new Date()) {
		throw new ValidationError("This reset link is invalid or has expired.")
	}

	const hashed = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)

	await prisma.$transaction([
		prisma.user.update({
			where: { id: record.userId },
			data: { password: hashed, tokenVersion: { increment: 1 } },
		}),
		prisma.passwordResetToken.update({
			where: { tokenHash: record.tokenHash },
			data: { usedAt: new Date() },
		}),
		prisma.passwordResetToken.deleteMany({
			where: { userId: record.userId, usedAt: null },
		}),
	])

	return record.userId
}

export const pruneExpiredPasswordResets = async (): Promise<number> => {
	const { count } = await prisma.passwordResetToken.deleteMany({
		where: { expiresAt: { lt: new Date() } },
	})
	return count
}
