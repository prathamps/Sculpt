import { createHash } from "crypto"
import { Request } from "express"
import { Prisma } from "@prisma/client"
import { Counter } from "prom-client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { metricsRegistry } from "../../lib/metrics"
import { currentRequestContext } from "../../lib/request-context"
import { TtlCache } from "../../lib/ttl-cache"

export type AuditAction =
	| "user.registered"
	| "user.login_succeeded"
	| "user.login_failed"
	| "user.login_locked_out"
	| "user.logged_out"
	| "user.oauth_login"
	| "user.oauth_login_failed"
	| "user.oauth_linked"
	| "user.password_changed"
	| "user.password_reset_requested"
	| "user.password_reset_completed"
	| "user.profile_updated"
	| "user.notification_preferences_updated"
	| "user.role_changed"
	| "user.account_deleted"
	| "user.data_exported"
	| "user.mfa_enabled"
	| "user.mfa_disabled"
	| "user.mfa_challenge_failed"
	| "user.mfa_recovery_code_used"
	| "user.mfa_recovery_codes_regenerated"
	| "admin.login_succeeded"
	| "admin.login_failed"
	| "admin.logged_out"
	| "admin.users_viewed"
	| "admin.projects_viewed"
	| "admin.project_viewed"
	| "admin.audit_viewed"
	| "admin.audit_exported"
	| "admin.audit_verified"
	| "access.denied"
	| "project.created"
	| "project.updated"
	| "project.settings_changed"
	| "project.deleted"
	| "project.member_invited"
	| "project.member_removed"
	| "project.member_left"
	| "project.member_role_changed"
	| "project.member_joined_via_link"
	| "project.invitation_sent"
	| "project.invitation_revoked"
	| "project.invitation_accept_failed"
	| "comment.created"
	| "comment.edited"
	| "comment.deleted"
	| "comment.deleted_by_owner"
	| "comment.resolution_changed"
	| "comment.resolved_by_owner"
	| "comment.attachments_added"
	| "share_link.created"
	| "share_link.revoked"
	| "share_link.join_failed"
	| "review.decision_recorded"
	| "review.reopened"
	| "review.due_date_changed"
	| "media.uploaded"
	| "media.version_uploaded"
	| "media.updated"
	| "media.version_renamed"
	| "media.deleted"
	| "media.downloaded"
	| "media.accessed"
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
	userAgent?: string | null
}

export interface ChainedAuditFields {
	sequence: number
	createdAt: Date
	action: string
	targetType: string
	targetId: string | null
	actorId: string | null
	metadata: unknown
	ipAddress: string | null
	userAgent: string | null
	requestId: string | null
	prevHash: string | null
}

const AUDIT_CHAIN_LOCK_KEY = 815_431_007
const CHAIN_TRANSACTION_TIMEOUT_MS = 10000
const CHAIN_TRANSACTION_MAX_WAIT_MS = 5000

const auditWriteFailures = new Counter({
	name: "sculpt_audit_write_failures_total",
	help: "Audit entries that could not be written",
	registers: [metricsRegistry],
})

const auditEventsRecorded = new Counter({
	name: "sculpt_audit_events_total",
	help: "Audit entries written, by action",
	labelNames: ["action"] as const,
	registers: [metricsRegistry],
})

export const requestIp = (req: Request): string | null => req.ip ?? null

const sortedForHashing = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sortedForHashing)
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortedForHashing((value as Record<string, unknown>)[key])])
		)
	}
	return value
}

export const canonicalJson = (value: unknown): string =>
	JSON.stringify(sortedForHashing(value === undefined ? null : value))

const asStoredJson = (value: unknown): unknown =>
	value === undefined || value === null ? null : JSON.parse(JSON.stringify(value))

export const auditEntryHash = (fields: ChainedAuditFields): string =>
	createHash("sha256")
		.update(
			canonicalJson({
				...fields,
				metadata: asStoredJson(fields.metadata),
				createdAt: fields.createdAt.toISOString(),
			})
		)
		.digest("hex")

const withRequestContext = (entry: AuditEntry) => {
	const context = currentRequestContext()
	return {
		action: entry.action,
		targetType: entry.targetType,
		targetId: entry.targetId ?? null,
		actorId: entry.actorId ?? null,
		metadata: asStoredJson(entry.metadata),
		ipAddress: entry.ipAddress ?? context?.ipAddress ?? null,
		userAgent: entry.userAgent ?? context?.userAgent ?? null,
		requestId: context?.requestId ?? null,
	}
}

const appendToChain = async (entry: AuditEntry) => {
	const fields = withRequestContext(entry)
	return prisma.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY}::bigint)`
			const previous = await tx.auditLog.findFirst({
				orderBy: { sequence: "desc" },
				select: { sequence: true, hash: true },
			})
			const chained: ChainedAuditFields = {
				...fields,
				sequence: (previous?.sequence ?? 0) + 1,
				createdAt: new Date(),
				prevHash: previous?.hash ?? null,
			}
			return tx.auditLog.create({
				data: {
					...chained,
					metadata: (chained.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
					hash: auditEntryHash(chained),
				},
				select: { sequence: true, hash: true },
			})
		},
		{
			timeout: CHAIN_TRANSACTION_TIMEOUT_MS,
			maxWait: CHAIN_TRANSACTION_MAX_WAIT_MS,
		}
	)
}

export const recordAudit = async (entry: AuditEntry): Promise<void> => {
	try {
		const written = await appendToChain(entry)
		auditEventsRecorded.inc({ action: entry.action })
		logger.info("audit", {
			auditSequence: written.sequence,
			auditHash: written.hash,
			action: entry.action,
			targetType: entry.targetType,
			targetId: entry.targetId ?? null,
			actorId: entry.actorId ?? null,
		})
	} catch (error) {
		auditWriteFailures.inc()
		logger.error("Failed to write audit log entry", error, {
			action: entry.action,
		})
	}
}

const recentlyRecorded = new TtlCache<true>(15 * 60000, 50000)

export const recordAuditOnce = async (
	dedupeKey: string,
	entry: AuditEntry
): Promise<void> => {
	const key = `${entry.action}|${dedupeKey}`
	if (recentlyRecorded.get(key)) return
	recentlyRecorded.set(key, true)
	await recordAudit(entry)
}

export const forgetRecordedAudits = (): void => recentlyRecorded.clear()

export interface AuditLogQuery {
	page: number
	pageSize: number
	action?: string
	actorId?: string
	targetType?: string
	targetId?: string
	ipAddress?: string
	from?: Date
	to?: Date
}

export const auditWhere = (query: Omit<AuditLogQuery, "page" | "pageSize">) => {
	const where: Prisma.AuditLogWhereInput = {
		...(query.action ? { action: query.action } : {}),
		...(query.actorId ? { actorId: query.actorId } : {}),
		...(query.targetType ? { targetType: query.targetType } : {}),
		...(query.targetId ? { targetId: query.targetId } : {}),
		...(query.ipAddress ? { ipAddress: query.ipAddress } : {}),
		...(query.from || query.to
			? {
					createdAt: {
						...(query.from ? { gte: query.from } : {}),
						...(query.to ? { lte: query.to } : {}),
					},
				}
			: {}),
	}
	return where
}

export interface AuditActor {
	id: string
	email: string
	name: string | null
}

export const actorsById = async (
	actorIds: (string | null)[]
): Promise<Map<string, AuditActor>> => {
	const ids = Array.from(new Set(actorIds.filter((id): id is string => !!id)))
	if (ids.length === 0) return new Map()
	const users = await prisma.user.findMany({
		where: { id: { in: ids } },
		select: { id: true, email: true, name: true },
	})
	return new Map(users.map((user) => [user.id, user]))
}

export const listAuditLogs = async (query: AuditLogQuery) => {
	const where = auditWhere(query)

	const [total, logs] = await Promise.all([
		prisma.auditLog.count({ where }),
		prisma.auditLog.findMany({
			where,
			orderBy: { sequence: "desc" },
			skip: (query.page - 1) * query.pageSize,
			take: query.pageSize,
		}),
	])

	const actors = await actorsById(logs.map((log) => log.actorId))

	return {
		total,
		page: query.page,
		pageSize: query.pageSize,
		logs: logs.map((log) => ({
			...log,
			actor: log.actorId ? actors.get(log.actorId) ?? null : null,
		})),
	}
}

export interface ChainVerification {
	intact: boolean
	checked: number
	unchainedLegacyEntries: number
	firstSequence: number | null
	lastSequence: number | null
	brokenAtSequence: number | null
	problem: "content_changed" | "link_broken" | "entries_missing" | null
}

const VERIFY_BATCH_SIZE = 1000

export const verifyAuditChain = async (): Promise<ChainVerification> => {
	const result: ChainVerification = {
		intact: true,
		checked: 0,
		unchainedLegacyEntries: 0,
		firstSequence: null,
		lastSequence: null,
		brokenAtSequence: null,
		problem: null,
	}
	let previous: { sequence: number; hash: string } | null = null
	let cursor = 0

	const fail = (sequence: number, problem: ChainVerification["problem"]) => {
		result.intact = false
		result.brokenAtSequence = sequence
		result.problem = problem
		return result
	}

	for (;;) {
		const batch = await prisma.auditLog.findMany({
			where: { sequence: { gt: cursor } },
			orderBy: { sequence: "asc" },
			take: VERIFY_BATCH_SIZE,
		})
		if (batch.length === 0) return result

		for (const entry of batch) {
			cursor = entry.sequence
			result.firstSequence ??= entry.sequence
			result.lastSequence = entry.sequence

			if (!entry.hash) {
				if (previous) return fail(entry.sequence, "content_changed")
				result.unchainedLegacyEntries++
				continue
			}

			if (previous) {
				if (entry.sequence !== previous.sequence + 1) {
					return fail(entry.sequence, "entries_missing")
				}
				if (entry.prevHash !== previous.hash) {
					return fail(entry.sequence, "link_broken")
				}
			}

			const expected = auditEntryHash({
				sequence: entry.sequence,
				createdAt: entry.createdAt,
				action: entry.action,
				targetType: entry.targetType,
				targetId: entry.targetId,
				actorId: entry.actorId,
				metadata: entry.metadata,
				ipAddress: entry.ipAddress,
				userAgent: entry.userAgent,
				requestId: entry.requestId,
				prevHash: entry.prevHash,
			})
			if (expected !== entry.hash) return fail(entry.sequence, "content_changed")

			result.checked++
			previous = { sequence: entry.sequence, hash: entry.hash }
		}
	}
}
