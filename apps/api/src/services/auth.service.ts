import { User, UserRole } from "@prisma/client"
import bcrypt from "bcrypt"
import { prisma } from "../lib/prisma"
import { ensureSubscription } from "./subscription.service"

interface RegisterUserInput {
	email: string
	password: string
	name?: string
}

interface LoginUserInput {
	email: string
	password: string
}

export const registerUser = async (data: RegisterUserInput): Promise<User> => {
	const hashedPassword = await bcrypt.hash(data.password, 10)

	const user = await prisma.user.create({
		data: {
			email: data.email,
			password: hashedPassword,
			name: data.name || data.email.split("@")[0],
			provider: "local",
		},
	})

	// Every account starts on the FREE plan.
	await ensureSubscription(user.id)

	return user
}

export const loginUser = async (data: LoginUserInput): Promise<User | null> => {
	const user = await prisma.user.findUnique({
		where: {
			email: data.email,
		},
	})

	if (!user) return null

	// OAuth-only accounts have no password set — they must use the provider.
	if (!user.password) return null

	const validPassword = await bcrypt.compare(data.password, user.password)
	if (!validPassword) return null

	// Backfill a subscription for older accounts created before billing existed.
	await ensureSubscription(user.id)

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
): Promise<User> => {
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
		await ensureSubscription(user.id)
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
	await ensureSubscription(created.id)
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
			subscription: {
				select: {
					plan: true,
					status: true,
				},
			},
		},
	})
}
