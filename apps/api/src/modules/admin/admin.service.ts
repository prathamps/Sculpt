import { prisma } from "../../lib/prisma"
import { UserRole } from "@prisma/client"

export const getAllUsers = async () => {
	return prisma.user.findMany({
		select: {
			id: true,
			email: true,
			name: true,
			role: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	})
}

export const updateUserRole = async (userId: string, role: UserRole) => {
	return prisma.user.update({
		where: { id: userId },
		data: { role },
		select: {
			id: true,
			email: true,
			name: true,
			role: true,
		},
	})
}

export const getAllProjects = async () => {
	return prisma.project.findMany({
		include: {
			members: {
				include: {
					user: {
						select: {
							id: true,
							email: true,
							name: true,
						},
					},
				},
			},
			_count: {
				select: {
					images: true,
				},
			},
		},
		orderBy: {
			createdAt: "desc",
		},
	})
}

export const getProjectById = async (projectId: string) => {
	return prisma.project.findUnique({
		where: { id: projectId },
		include: {
			members: {
				include: {
					user: {
						select: {
							id: true,
							email: true,
							name: true,
						},
					},
				},
			},
			images: {
				include: {
					versions: {
						include: {
							_count: {
								select: {
									comments: true,
								},
							},
						},
					},
				},
			},
		},
	})
}

const TREND_DAYS = 30

export const getDashboardStats = async () => {
	const [
		userCount,
		projectCount,
		imageCount,
		commentCount,
		usersByDay,
		projectsByDay,
	] = await Promise.all([
		prisma.user.count(),
		prisma.project.count(),
		prisma.image.count(),
		prisma.comment.count(),
		prisma.user.groupBy({
			by: ["createdAt"],
			_count: true,
			orderBy: {
				createdAt: "asc",
			},
			take: TREND_DAYS,
		}),
		prisma.project.groupBy({
			by: ["createdAt"],
			_count: true,
			orderBy: {
				createdAt: "asc",
			},
			take: TREND_DAYS,
		}),
	])

	return {
		totalUsers: userCount,
		totalProjects: projectCount,
		totalImages: imageCount,
		totalComments: commentCount,
		usersByDay: usersByDay.map((day) => ({
			date: day.createdAt,
			count: day._count,
		})),
		projectsByDay: projectsByDay.map((day) => ({
			date: day.createdAt,
			count: day._count,
		})),
	}
}
