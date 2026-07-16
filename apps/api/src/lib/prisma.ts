import { PrismaClient } from "@prisma/client"

// The password hash is omitted from every User query by default so it can
// never leak through API responses (req.user, project members, comment
// authors, ...). Auth code that needs it opts back in with
// `omit: { password: false }`.
const createPrismaClient = () =>
	new PrismaClient({
		omit: { user: { password: true } },
	})

declare global {
	var prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = global.prisma || createPrismaClient()

if (process.env.NODE_ENV !== "production") {
	global.prisma = prisma
}
