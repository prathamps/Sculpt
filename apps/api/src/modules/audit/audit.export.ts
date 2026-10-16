import { prisma } from "../../lib/prisma"
import { csvRow } from "../../lib/csv"
import { actorsById, auditWhere } from "./audit.service"
import { AuditFilters } from "./audit.schema"

const EXPORT_BATCH_SIZE = 1000

export const AUDIT_CSV_HEADER = [
	"sequence",
	"createdAt",
	"action",
	"actorId",
	"actorEmail",
	"targetType",
	"targetId",
	"ipAddress",
	"userAgent",
	"requestId",
	"metadata",
	"prevHash",
	"hash",
]

export const writeAuditCsv = async (
	filters: AuditFilters,
	write: (chunk: string) => void
): Promise<number> => {
	const where = auditWhere(filters)
	write(`${csvRow(AUDIT_CSV_HEADER)}\n`)
	let cursor = 0
	let exported = 0

	for (;;) {
		const batch = await prisma.auditLog.findMany({
			where: { ...where, sequence: { gt: cursor } },
			orderBy: { sequence: "asc" },
			take: EXPORT_BATCH_SIZE,
		})
		if (batch.length === 0) return exported

		const actors = await actorsById(batch.map((entry) => entry.actorId))
		write(
			batch
				.map((entry) =>
					csvRow([
						entry.sequence,
						entry.createdAt.toISOString(),
						entry.action,
						entry.actorId,
						entry.actorId ? actors.get(entry.actorId)?.email ?? "" : "",
						entry.targetType,
						entry.targetId,
						entry.ipAddress,
						entry.userAgent,
						entry.requestId,
						entry.metadata === null ? "" : JSON.stringify(entry.metadata),
						entry.prevHash,
						entry.hash,
					])
				)
				.join("\n") + "\n"
		)
		exported += batch.length
		cursor = batch[batch.length - 1]!.sequence
	}
}
