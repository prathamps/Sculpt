import { PrismaClient } from "@prisma/client"

const createPrismaClientOmittingUserPasswords = () =>
	new PrismaClient({
		omit: { user: { password: true } },
	})

declare global {
	var prisma: ReturnType<typeof createPrismaClientOmittingUserPasswords> | undefined
}

export const prisma = global.prisma || createPrismaClientOmittingUserPasswords()

if (process.env.NODE_ENV !== "production") {
	global.prisma = prisma
}
