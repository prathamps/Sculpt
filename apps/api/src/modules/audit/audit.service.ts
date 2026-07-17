import { Request } from "express"
import { Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"

export type AuditAction =
	| "user.registered"
	| "user.login_succeeded"
	| "user.login_failed"
	| "user.logged_out"
	| "user.oauth_login"
	| "user.role_changed"
	| "admin.login_succeeded"
	| "admin.login_failed"
	| "project.created"
	| "project.updated"
	| "project.deleted"
	| "project.member_invited"
	| "project.member_removed"
	| "project.member_joined_via_link"
	| "share_link.created"
	| "share_link.revoked"
	| "media.uploaded"
	| "media.version_uploaded"
	| "media.updated"
	| "media.deleted"
	| "media.version_deleted"
	| "report.exported"

export interface AuditEntry {
	action: AuditAction
	targetType: string
	targetId?: string | null
	actorId?: string | null
	metadata?: Prisma.InputJsonValue
	ipAddress?: string | null
}

// Express resolves req.ip from X-Forwarded-For only when `trust proxy` is
// configured (see app.ts / TRUST_PROXY), so a direct-facing deployment records
// the real socket address and the header can't be spoofed into the audit trail.
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
		console.error("Failed to write audit log entry", entry.action, error)
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
