import { User, UserRole } from "@prisma/client"
import bcrypt from "bcrypt"
import { prisma } from "../lib/prisma"

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

	return prisma.user.create({
		data: {
			email: data.email,
			password: hashedPassword,
			name: data.name || data.email.split("@")[0],
		},
	})
}

export const loginUser = async (data: LoginUserInput): Promise<User | null> => {
	const user = await prisma.user.findUnique({
		where: {
			email: data.email,
		},
	})

	if (!user) return null

	const validPassword = await bcrypt.compare(data.password, user.password)
	if (!validPassword) return null

	return user
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
