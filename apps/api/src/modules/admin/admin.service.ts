import { Prisma, UserRole } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { PageRequest, skipTake } from "../../lib/pagination"
import { ValidationError } from "../../lib/errors"

const TREND_DAYS = 30

const USER_SUMMARY_SELECT = {
	id: true,
	email: true,
	name: true,
	role: true,
	createdAt: true,
	updatedAt: true,
}

export const getAllUsers = async (page: PageRequest, search?: string) => {
	const where = search
		? {
				OR: [
					{ email: { contains: search, mode: "insensitive" as const } },
					{ name: { contains: search, mode: "insensitive" as const } },
				],
			}
		: {}

	const [total, users] = await Promise.all([
		prisma.user.count({ where }),
		prisma.user.findMany({
			where,
			select: USER_SUMMARY_SELECT,
			orderBy: { createdAt: "desc" },
			...skipTake(page),
		}),
	])

	return { users, total }
}

export const updateUserRole = async (userId: string, role: UserRole) => {
	if (role !== UserRole.ADMIN) {
		const admins = await prisma.user.count({ where: { role: UserRole.ADMIN } })
		const target = await prisma.user.findUnique({
			where: { id: userId },
			select: { role: true },
		})
		if (target?.role === UserRole.ADMIN && admins <= 1) {
			throw new ValidationError(
				"This is the last administrator. Promote someone else before demoting them."
			)
		}
	}

	return prisma.user.update({
		where: { id: userId },
		data: { role, tokenVersion: { increment: 1 } },
		select: { id: true, email: true, name: true, role: true },
	})
}

export const getAllProjects = async (page: PageRequest) => {
	const [total, projects] = await Promise.all([
		prisma.project.count(),
		prisma.project.findMany({
			include: {
				members: {
					select: {
						role: true,
						user: { select: { id: true, email: true, name: true } },
					},
				},
				_count: { select: { images: true } },
			},
			orderBy: { createdAt: "desc" },
			...skipTake(page),
		}),
	])

	return { projects, total }
}

export const getProjectById = async (projectId: string) =>
	prisma.project.findUnique({
		where: { id: projectId },
		include: {
			members: {
				select: {
					role: true,
					user: { select: { id: true, email: true, name: true } },
				},
			},
			images: {
				include: {
					versions: {
						orderBy: { versionNumber: "desc" },
						include: { _count: { select: { comments: true } } },
					},
				},
				orderBy: { createdAt: "desc" },
			},
		},
	})

interface DailyCount {
	date: Date
	count: number
}

const TREND_TABLES = {
	User: Prisma.sql`"User"`,
	Project: Prisma.sql`"Project"`,
}

const dailyCounts = async (
	table: keyof typeof TREND_TABLES
): Promise<DailyCount[]> => {
	const rows = await prisma.$queryRaw<{ date: Date; count: bigint }[]>(
		Prisma.sql`SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count
		 FROM ${TREND_TABLES[table]}
		 WHERE "createdAt" >= NOW() - make_interval(days => ${TREND_DAYS})
		 GROUP BY 1
		 ORDER BY 1 ASC`
	)

	return rows.map((row) => ({ date: row.date, count: Number(row.count) }))
}

export const getDashboardStats = async () => {
	const [
		totalUsers,
		totalProjects,
		totalImages,
		totalComments,
		usersByDay,
		projectsByDay,
	] = await Promise.all([
		prisma.user.count(),
		prisma.project.count(),
		prisma.image.count(),
		prisma.comment.count(),
		dailyCounts("User"),
		dailyCounts("Project"),
	])

	return {
		totalUsers,
		totalProjects,
		totalImages,
		totalComments,
		usersByDay,
		projectsByDay,
	}
}
