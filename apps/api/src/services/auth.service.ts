import { prisma } from "../lib/prisma"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { User } from "@prisma/client"

interface RegisterData {
	email: string
	password: string
	name?: string
}

export const registerUser = async (data: RegisterData): Promise<User> => {
	const { email, password, name } = data
	const hashedPassword = await bcrypt.hash(password, 10)
	return prisma.user.create({
		data: {
			email,
			password: hashedPassword,
			name,
		},
	})
}

// Return user object on successful login
export const loginUser = async (
	data: Pick<User, "email" | "password">
): Promise<User | null> => {
	const user = await prisma.user.findUnique({
		where: { email: data.email },
	})

	if (!user || !(await bcrypt.compare(data.password, user.password))) {
		return null
	}

	return user
}
