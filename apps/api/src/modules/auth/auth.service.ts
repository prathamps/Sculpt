import { User, UserRole } from "@prisma/client"
import bcrypt from "bcrypt"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, ValidationError } from "../../lib/errors"

// User as returned by the API surface — the password hash is globally omitted
// from Prisma results (see lib/prisma.ts).
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
	// Opt back in to the password column (globally omitted) for the compare.
	const user = await prisma.user.findUnique({
		where: {
			email: data.email,
		},
		omit: { password: false },
	})

	if (!user) return null

	// OAuth-only accounts have no password set — they must use the provider.
	if (!user.password) return null

	const validPassword = await bcrypt.compare(data.password, user.password)
	if (!validPassword) return null

	return user
}

interface OAuthUserInput {
	provider: string
	providerId: string
	email: string
	name?: string | null
	avatarUrl?: string | null
}

// Find a user by email (linking OAuth to an existing account) or create one.
export const findOrCreateOAuthUser = async (
	data: OAuthUserInput
): Promise<SafeUser> => {
	const existing = await prisma.user.findUnique({
		where: { email: data.email },
	})

	if (existing) {
		// Record the OAuth link / avatar on accounts that don't have them yet.
		const needsUpdate =
			(!existing.providerId && !!data.providerId) ||
			(!existing.avatarUrl && !!data.avatarUrl)
		const user = needsUpdate
			? await prisma.user.update({
					where: { id: existing.id },
					data: {
						providerId: existing.providerId ?? data.providerId,
						avatarUrl: existing.avatarUrl ?? data.avatarUrl ?? null,
						provider: existing.provider ?? data.provider,
					},
			  })
			: existing
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
	// Opt back in to the password column (globally omitted) for the compare.
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

	// Only return the user if they're an admin
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
	await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
}
