import { PrismaClient, UserRole } from "@prisma/client"

const prisma = new PrismaClient()

const usage = (): never => {
	console.error(
		"Usage: node dist/scripts/promote-admin.js <email>\n" +
			"Grants the ADMIN role to an existing Sculpt account."
	)
	process.exit(1)
}

const main = async (): Promise<void> => {
	const email = process.argv[2]?.trim().toLowerCase()
	if (!email) usage()

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true, role: true },
	})

	if (!user) {
		console.error(
			`No account exists for ${email}. Register through the UI first, then re-run this.`
		)
		process.exit(1)
	}

	if (user.role === UserRole.ADMIN) {
		console.log(`${user.email} is already an administrator.`)
		return
	}

	await prisma.user.update({
		where: { id: user.id },
		data: { role: UserRole.ADMIN, tokenVersion: { increment: 1 } },
	})

	console.log(
		`Promoted ${user.email} to ADMIN. Existing sessions were invalidated — sign in again.`
	)
}

main()
	.catch((error) => {
		console.error(
			`Could not promote the user: ${
				error instanceof Error ? error.message : String(error)
			}`
		)
		process.exit(1)
	})
	.finally(() => {
		void prisma.$disconnect()
	})
