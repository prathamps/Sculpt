import { PrismaClient } from "@prisma/client"

const createPrismaClientOmittingPrivateColumns = () =>
	new PrismaClient({
		omit: {
			user: { password: true, totpSecret: true, totpPendingSecret: true },
			imageVersion: { proxyOwner: true },
		},
	})

declare global {
	var prisma: ReturnType<typeof createPrismaClientOmittingPrivateColumns> | undefined
}

export const prisma = global.prisma || createPrismaClientOmittingPrivateColumns()

if (process.env.NODE_ENV !== "production") {
	global.prisma = prisma
}
