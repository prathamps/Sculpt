import { Prisma, ProjectRole, RevisionCheckStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, NotFoundError } from "../../lib/errors"
import { io } from "../../realtime/socket"
import { roleMeets } from "../projects/access"
import {
	announceCommentUpdated,
	canSeeInternalComments,
} from "../comments/comments.service"

const MAX_CHECKLIST_ITEMS = 500

const PERSON_SELECT = { select: { id: true, name: true, email: true, avatarUrl: true } } as const

const ITEM_SELECT = {
	id: true,
	content: true,
	userId: true,
	resolved: true,
	internal: true,
	timestamp: true,
	timestampEnd: true,
	page: true,
	modelAnchor: true,
	annotation: true,
	createdAt: true,
	user: PERSON_SELECT,
	imageVersion: { select: { id: true, versionName: true, versionNumber: true } },
	revisionChecks: {
		orderBy: { updatedAt: "desc" },
		select: {
			status: true,
			imageVersionId: true,
			updatedAt: true,
			user: PERSON_SELECT,
			imageVersion: { select: { versionNumber: true, versionName: true } },
		},
	},
} satisfies Prisma.CommentSelect

type ChecklistRow = Prisma.CommentGetPayload<{ select: typeof ITEM_SELECT }>

export interface RevisionCheckSummary {
	total: number
	fixed: number
	notFixed: number
	unchecked: number
}

const versionOf = async (versionId: string) => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: versionId },
		select: { id: true, imageId: true, versionNumber: true },
	})
	if (!version) throw new NotFoundError("Version not found")
	return version
}

export const toChecklistItem = (
	row: ChecklistRow,
	versionId: string,
	versionNumber: number
) => {
	const check = row.revisionChecks.find((entry) => entry.imageVersionId === versionId) ?? null
	const earlierFlag =
		row.revisionChecks.find(
			(entry) =>
				entry.status === "NOT_FIXED" && entry.imageVersion.versionNumber < versionNumber
		) ?? null
	return {
		commentId: row.id,
		content: row.content,
		author: row.user,
		createdAt: row.createdAt,
		internal: row.internal,
		resolved: row.resolved,
		fromVersion: row.imageVersion,
		timestamp: row.timestamp,
		timestampEnd: row.timestampEnd,
		page: row.page,
		modelAnchor: row.modelAnchor,
		annotation: row.annotation,
		check: check && {
			status: check.status,
			checkedBy: check.user,
			checkedAt: check.updatedAt,
		},
		stillOpenOn: earlierFlag && {
			versionNumber: earlierFlag.imageVersion.versionNumber,
			versionName: earlierFlag.imageVersion.versionName,
		},
	}
}

export type RevisionChecklistItem = ReturnType<typeof toChecklistItem>

export const summarise = (items: RevisionChecklistItem[]): RevisionCheckSummary => {
	const fixed = items.filter((item) => item.check?.status === "FIXED").length
	const notFixed = items.filter((item) => item.check?.status === "NOT_FIXED").length
	return { total: items.length, fixed, notFixed, unchecked: items.length - fixed - notFixed }
}

export const getRevisionChecklist = async (
	versionId: string,
	role: ProjectRole | null
) => {
	const version = await versionOf(versionId)
	const rows = await prisma.comment.findMany({
		where: {
			parentId: null,
			imageVersion: {
				imageId: version.imageId,
				versionNumber: { lt: version.versionNumber },
			},
			...(canSeeInternalComments(role) ? {} : { internal: false }),
			OR: [
				{ resolved: false },
				{ revisionChecks: { some: { imageVersionId: versionId } } },
			],
		},
		orderBy: [{ imageVersion: { versionNumber: "asc" } }, { createdAt: "asc" }],
		take: MAX_CHECKLIST_ITEMS,
		select: ITEM_SELECT,
	})
	const items = rows.map((row) => toChecklistItem(row, versionId, version.versionNumber))
	return {
		versionId,
		items,
		summary: summarise(items),
		truncated: rows.length === MAX_CHECKLIST_ITEMS,
	}
}

const carriedComment = async (
	versionId: string,
	commentId: string,
	role: ProjectRole | null
) => {
	const version = await versionOf(versionId)
	const comment = await prisma.comment.findUnique({
		where: { id: commentId },
		select: {
			id: true,
			userId: true,
			resolved: true,
			internal: true,
			parentId: true,
			imageVersion: { select: { imageId: true, versionNumber: true } },
		},
	})
	const isCarried =
		!!comment &&
		comment.parentId === null &&
		comment.imageVersion.imageId === version.imageId &&
		comment.imageVersion.versionNumber < version.versionNumber &&
		(!comment.internal || canSeeInternalComments(role))
	if (!isCarried || !comment) {
		throw new NotFoundError("That feedback is not on an earlier version of this file")
	}
	return comment
}

const lockComment = (tx: Prisma.TransactionClient, commentId: string) =>
	tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`revision_check:${commentId}`}, 0))`

const mayConfirmFix = (
	comment: { userId: string },
	userId: string,
	role: ProjectRole | null
): boolean => comment.userId === userId || roleMeets(role, "EDITOR")

const announce = (versionId: string, commentId: string) =>
	io.to(`imageVersion:${versionId}`).emit("revision-check-updated", { versionId, commentId })

export const recordRevisionCheck = async (input: {
	versionId: string
	commentId: string
	userId: string
	role: ProjectRole | null
	status: RevisionCheckStatus
}) => {
	const comment = await carriedComment(input.versionId, input.commentId, input.role)
	if (input.status === "FIXED" && !mayConfirmFix(comment, input.userId, input.role)) {
		throw new ForbiddenError(
			"Only the person who gave this feedback or a project editor can confirm it is fixed"
		)
	}

	const key = { commentId_imageVersionId: { commentId: comment.id, imageVersionId: input.versionId } }

	const outcome = await prisma.$transaction(async (tx) => {
		await lockComment(tx, comment.id)
		const existing = await tx.revisionCheck.findUnique({ where: key })
		if (existing && existing.userId !== input.userId && !roleMeets(input.role, "EDITOR")) {
			throw new ForbiddenError(
				"Only the person who checked it or a project editor can change this verdict"
			)
		}
		const current = await tx.comment.findUnique({
			where: { id: comment.id },
			select: { resolved: true },
		})
		const wasResolved = current?.resolved ?? comment.resolved
		const resolvesNow = input.status === "FIXED" && !wasResolved
		const reopens =
			input.status === "NOT_FIXED" && existing?.status === "FIXED" && existing.resolvedComment

		await tx.revisionCheck.upsert({
			where: key,
			create: {
				commentId: comment.id,
				imageVersionId: input.versionId,
				userId: input.userId,
				status: input.status,
				resolvedComment: resolvesNow,
			},
			update: {
				userId: input.userId,
				status: input.status,
				resolvedComment:
					input.status === "FIXED" ? resolvesNow || !!existing?.resolvedComment : false,
			},
		})
		if (resolvesNow || reopens) {
			await tx.comment.update({ where: { id: comment.id }, data: { resolved: resolvesNow } })
		}
		return {
			changedResolution: resolvesNow || reopens,
			resolved: resolvesNow ? true : reopens ? false : wasResolved,
			previous: existing ? { status: existing.status, checkedBy: existing.userId } : null,
		}
	})

	if (outcome.changedResolution) await announceCommentUpdated(comment.id)
	announce(input.versionId, comment.id)

	return { status: input.status, resolved: outcome.resolved, previous: outcome.previous }
}

export const clearRevisionCheck = async (input: {
	versionId: string
	commentId: string
	userId: string
	role: ProjectRole | null
}) => {
	const comment = await carriedComment(input.versionId, input.commentId, input.role)
	const key = { commentId_imageVersionId: { commentId: comment.id, imageVersionId: input.versionId } }

	const cleared = await prisma.$transaction(async (tx) => {
		await lockComment(tx, comment.id)
		const existing = await tx.revisionCheck.findUnique({ where: key })
		if (!existing) throw new NotFoundError("That feedback has not been checked on this version")
		if (existing.userId !== input.userId && !roleMeets(input.role, "EDITOR")) {
			throw new ForbiddenError("Only the person who checked it or a project editor can undo this")
		}
		await tx.revisionCheck.delete({ where: key })
		const reopens = existing.status === "FIXED" && existing.resolvedComment
		if (reopens) {
			await tx.comment.update({ where: { id: comment.id }, data: { resolved: false } })
		}
		return { status: existing.status, reopens }
	})

	if (cleared.reopens) await announceCommentUpdated(comment.id)
	announce(input.versionId, comment.id)
	return { cleared: cleared.status }
}
