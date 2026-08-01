import { User, UserRole } from "@prisma/client"
import bcrypt from "bcrypt"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, ValidationError } from "../../lib/errors"
import { recordAudit } from "../audit/audit.service"

export type SafeUser = Omit<User, "password">

interface RegisterUserInput {
	email: string
	password: string
	name?: string
}

interface LoginUserInput {
	email: string
	password: string
}

export const registerUser = async (
	data: RegisterUserInput
): Promise<SafeUser> => {
	const hashedPassword = await bcrypt.hash(data.password, 10)

	const user = await prisma.user.create({
		data: {
			email: data.email,
			password: hashedPassword,
			name: data.name || data.email.split("@")[0],
			provider: "local",
		},
	})

	return user
}

export const loginUser = async (data: LoginUserInput): Promise<User | null> => {
	const user = await prisma.user.findUnique({
		where: {
			email: data.email,
		},
		omit: { password: false },
	})

	if (!user) return null

	if (!user.password) return null

	const validPassword = await bcrypt.compare(data.password, user.password)
	if (!validPassword) return null

	return user
}

interface OAuthUserInput {
	provider: string
	providerId: string
	email: string
	emailVerified: boolean
	name?: string | null
	avatarUrl?: string | null
}

export const findOrCreateOAuthUser = async (
	data: OAuthUserInput
): Promise<SafeUser | null> => {
	const linked = await prisma.user.findFirst({
		where: { provider: data.provider, providerId: data.providerId },
	})

	if (linked) {
		if (!linked.avatarUrl && data.avatarUrl) {
			return prisma.user.update({
				where: { id: linked.id },
				data: { avatarUrl: data.avatarUrl },
			})
		}
		return linked
	}

	const existing = await prisma.user.findUnique({
		where: { email: data.email },
	})

	if (existing) {
		if (!data.emailVerified || existing.providerId) return null
		const user = await prisma.user.update({
			where: { id: existing.id },
			data: {
				provider: data.provider,
				providerId: data.providerId,
				avatarUrl: existing.avatarUrl ?? data.avatarUrl ?? null,
			},
		})
		await recordAudit({
			action: "user.oauth_linked",
			targetType: "user",
			targetId: user.id,
			actorId: user.id,
			metadata: { provider: data.provider },
		})
		return user
	}

	const created = await prisma.user.create({
		data: {
			email: data.email,
			name: data.name || data.email.split("@")[0],
			provider: data.provider,
			providerId: data.providerId,
			avatarUrl: data.avatarUrl ?? null,
			password: null,
		},
	})
	return created
}

export const loginAdmin = async (
	email: string,
	password: string
): Promise<User | null> => {
	const user = await prisma.user.findUnique({
		where: {
			email,
		},
		omit: { password: false },
	})

	if (!user) return null
	if (!user.password) return null

	const validPassword = await bcrypt.compare(password, user.password)
	if (!validPassword) return null

	if (user.role !== UserRole.ADMIN) return null

	return user
}

export const getUsersByRole = async (role: UserRole) => {
	return prisma.user.findMany({
		where: {
			role,
		},
		select: {
			id: true,
			email: true,
			name: true,
			role: true,
			createdAt: true,
			updatedAt: true,
		},
	})
}

export const updateUserProfile = async (
	userId: string,
	data: { name?: string; avatarUrl?: string | null }
): Promise<SafeUser> => {
	const name = data.name?.trim()
	if (name !== undefined && name.length === 0) {
		throw new ValidationError("Name cannot be empty.")
	}
	return prisma.user.update({
		where: { id: userId },
		data: {
			...(name !== undefined ? { name } : {}),
			...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
		},
	})
}

export const changeUserPassword = async (
	userId: string,
	currentPassword: string,
	newPassword: string
): Promise<void> => {
	if (!newPassword || newPassword.length < 8) {
		throw new ValidationError(
			"New password must be at least 8 characters long."
		)
	}
	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: { password: false },
	})
	if (!user) throw new ValidationError("User not found.")
	if (!user.password) {
		throw new ForbiddenError(
			"This account signs in with a social provider and has no password to change."
		)
	}
	const valid = await bcrypt.compare(currentPassword, user.password)
	if (!valid) throw new ForbiddenError("Your current password is incorrect.")

	const hashed = await bcrypt.hash(newPassword, 10)
	await prisma.user.update({
		where: { id: userId },
		data: { password: hashed, tokenVersion: { increment: 1 } },
	})
}
