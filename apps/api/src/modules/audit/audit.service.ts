import { Request } from "express"
import { Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"

export type AuditAction =
	| "user.registered"
	| "user.login_succeeded"
	| "user.login_failed"
	| "user.logged_out"
	| "user.oauth_login"
	| "user.oauth_linked"
	| "user.password_changed"
	| "user.password_reset_requested"
	| "user.password_reset_completed"
	| "user.profile_updated"
	| "user.role_changed"
	| "user.account_deleted"
	| "user.data_exported"
	| "admin.login_succeeded"
	| "admin.login_failed"
	| "admin.logged_out"
	| "project.created"
	| "project.updated"
	| "project.deleted"
	| "project.member_invited"
	| "project.member_removed"
	| "project.member_role_changed"
	| "project.member_joined_via_link"
	| "project.invitation_sent"
	| "share_link.created"
	| "share_link.revoked"
	| "review.decision_recorded"
	| "review.reopened"
	| "media.uploaded"
	| "media.version_uploaded"
	| "media.updated"
	| "media.deleted"
	| "media.downloaded"
	| "media.moved"
	| "media.version_deleted"
	| "folder.created"
	| "folder.renamed"
	| "folder.moved"
	| "folder.deleted"
	| "report.exported"

export interface AuditEntry {
	action: AuditAction
	targetType: string
	targetId?: string | null
	actorId?: string | null
	metadata?: Prisma.InputJsonValue
	ipAddress?: string | null
}

export const requestIp = (req: Request): string | null => req.ip ?? null

export const recordAudit = async (entry: AuditEntry): Promise<void> => {
	try {
		await prisma.auditLog.create({
			data: {
				action: entry.action,
				targetType: entry.targetType,
				targetId: entry.targetId ?? null,
				actorId: entry.actorId ?? null,
				metadata: entry.metadata,
				ipAddress: entry.ipAddress ?? null,
			},
		})
	} catch (error) {
		logger.error("Failed to write audit log entry", error, {
			action: entry.action,
		})
	}
}

export interface AuditLogQuery {
	page: number
	pageSize: number
	action?: string
	actorId?: string
}

export const listAuditLogs = async (query: AuditLogQuery) => {
	const where: Prisma.AuditLogWhereInput = {
		...(query.action ? { action: query.action } : {}),
		...(query.actorId ? { actorId: query.actorId } : {}),
	}

	const [total, logs] = await Promise.all([
		prisma.auditLog.count({ where }),
		prisma.auditLog.findMany({
			where,
			include: {
				actor: {
					select: { id: true, email: true, name: true },
				},
			},
			orderBy: { createdAt: "desc" },
			skip: (query.page - 1) * query.pageSize,
			take: query.pageSize,
		}),
	])

	return { total, page: query.page, pageSize: query.pageSize, logs }
}
