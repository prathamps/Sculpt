import { Prisma, ReviewDecision, ReviewStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { NotFoundError } from "../../lib/errors"
import { io } from "../../realtime/socket"

const REVIEWER_SELECT = {
	select: { id: true, name: true, email: true, avatarUrl: true },
}

export const deriveReviewStatus = (
	decisions: ReviewDecision[]
): ReviewStatus => {
	if (decisions.includes(ReviewDecision.CHANGES_REQUESTED)) {
		return ReviewStatus.CHANGES_REQUESTED
	}
	if (decisions.includes(ReviewDecision.APPROVED)) {
		return ReviewStatus.APPROVED
	}
	return ReviewStatus.PENDING
}

const recalculateStatus = async (
	tx: Prisma.TransactionClient,
	imageVersionId: string
): Promise<ReviewStatus> => {
	const reviews = await tx.review.findMany({
		where: { imageVersionId },
		select: { decision: true },
	})
	const reviewStatus = deriveReviewStatus(reviews.map((r) => r.decision))

	await tx.imageVersion.update({
		where: { id: imageVersionId },
		data: { reviewStatus },
	})

	return reviewStatus
}

const announce = (imageVersionId: string, reviewStatus: ReviewStatus): void => {
	io.to(`imageVersion:${imageVersionId}`).emit("review-updated", {
		imageVersionId,
		reviewStatus,
	})
}

export const recordDecision = async (input: {
	imageVersionId: string
	userId: string
	decision: ReviewDecision
	note?: string | null
}): Promise<{ reviewStatus: ReviewStatus }> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: input.imageVersionId },
		select: { id: true },
	})
	if (!version) throw new NotFoundError("Image version not found")

	const reviewStatus = await prisma.$transaction(async (tx) => {
		await tx.review.upsert({
			where: {
				imageVersionId_userId: {
					imageVersionId: input.imageVersionId,
					userId: input.userId,
				},
			},
			update: { decision: input.decision, note: input.note ?? null },
			create: {
				imageVersionId: input.imageVersionId,
				userId: input.userId,
				decision: input.decision,
				note: input.note ?? null,
			},
		})
		return recalculateStatus(tx, input.imageVersionId)
	})

	announce(input.imageVersionId, reviewStatus)
	return { reviewStatus }
}

export const withdrawDecision = async (
	imageVersionId: string,
	userId: string
): Promise<{ reviewStatus: ReviewStatus }> => {
	const reviewStatus = await prisma.$transaction(async (tx) => {
		await tx.review.deleteMany({ where: { imageVersionId, userId } })
		return recalculateStatus(tx, imageVersionId)
	})

	announce(imageVersionId, reviewStatus)
	return { reviewStatus }
}

export const listDecisions = async (imageVersionId: string) => {
	const [version, reviews] = await Promise.all([
		prisma.imageVersion.findUnique({
			where: { id: imageVersionId },
			select: { reviewStatus: true, dueAt: true },
		}),
		prisma.review.findMany({
			where: { imageVersionId },
			include: { user: REVIEWER_SELECT },
			orderBy: { updatedAt: "desc" },
		}),
	])

	if (!version) throw new NotFoundError("Image version not found")

	return {
		reviewStatus: version.reviewStatus,
		dueAt: version.dueAt,
		reviews,
	}
}

export const setDueDate = async (
	imageVersionId: string,
	dueAt: Date | null
): Promise<void> => {
	await prisma.imageVersion.update({
		where: { id: imageVersionId },
		data: { dueAt },
	})

	io.to(`imageVersion:${imageVersionId}`).emit("review-due-date-updated", {
		imageVersionId,
		dueAt,
	})
}

export const projectReviewSummary = async (projectId: string) => {
	const grouped = await prisma.imageVersion.groupBy({
		by: ["reviewStatus"],
		where: { image: { projectId } },
		_count: { _all: true },
	})

	const counts: Record<ReviewStatus, number> = {
		PENDING: 0,
		CHANGES_REQUESTED: 0,
		APPROVED: 0,
	}

	for (const row of grouped) {
		counts[row.reviewStatus] = row._count._all
	}

	return counts
}
