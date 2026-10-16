import { z } from "zod"
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../lib/pagination"

const optionalFilter = z.string().trim().min(1).max(200).optional()

export const auditFilterSchema = z.object({
	action: optionalFilter,
	actorId: optionalFilter,
	targetType: optionalFilter,
	targetId: optionalFilter,
	ipAddress: optionalFilter,
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
})

export const auditQuerySchema = auditFilterSchema.extend({
	page: z.coerce.number().int().positive().default(1),
	pageSize: z.coerce
		.number()
		.int()
		.positive()
		.max(MAX_PAGE_SIZE)
		.default(DEFAULT_PAGE_SIZE),
})

export type AuditFilters = z.infer<typeof auditFilterSchema>
export type AuditQuery = z.infer<typeof auditQuerySchema>
