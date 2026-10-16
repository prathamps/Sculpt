"use client"

import { useState, useEffect, useCallback } from "react"
import { Download, ShieldAlert, ShieldCheck } from "lucide-react"
import { Table } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
const PAGE_SIZE = 25

interface AuditLogEntry {
	id: string
	sequence: number
	action: string
	actorId: string | null
	targetType: string
	targetId: string | null
	metadata: Record<string, unknown> | null
	ipAddress: string | null
	userAgent: string | null
	requestId: string | null
	createdAt: string
	actor: { id: string; email: string; name: string | null } | null
}

interface AuditLogResponse {
	total: number
	page: number
	pageSize: number
	logs: AuditLogEntry[]
}

interface ChainVerification {
	intact: boolean
	checked: number
	unchainedLegacyEntries: number
	brokenAtSequence: number | null
	problem: string | null
}

interface AuditFilters {
	action: string
	actorId: string
	targetType: string
	targetId: string
	ipAddress: string
	from: string
	to: string
}

const EMPTY_FILTERS: AuditFilters = {
	action: "",
	actorId: "",
	targetType: "",
	targetId: "",
	ipAddress: "",
	from: "",
	to: "",
}

const FILTER_FIELDS: { key: keyof AuditFilters; label: string; type?: string }[] = [
	{ key: "action", label: "Action" },
	{ key: "actorId", label: "Actor ID" },
	{ key: "targetType", label: "Target type" },
	{ key: "targetId", label: "Target ID" },
	{ key: "ipAddress", label: "IP address" },
	{ key: "from", label: "From", type: "date" },
	{ key: "to", label: "To", type: "date" },
]

const PROBLEM_DESCRIPTIONS: Record<string, string> = {
	content_changed: "an entry was altered after it was written",
	link_broken: "an entry no longer links to the one before it",
	entries_missing: "entries were removed from the middle of the trail",
}

export const auditQueryString = (filters: AuditFilters, page?: number): string => {
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(filters)) {
		if (!value.trim()) continue
		params.set(key, key === "to" ? `${value}T23:59:59.999Z` : value.trim())
	}
	if (page !== undefined) {
		params.set("page", String(page))
		params.set("pageSize", String(PAGE_SIZE))
	}
	return params.toString()
}

const actorLabel = (log: AuditLogEntry): string => {
	if (log.actor) return log.actor.email
	if (log.actorId) return `Deleted account · ${log.actorId.slice(0, 10)}`
	return "—"
}

export function AdminAuditLog() {
	const [data, setData] = useState<AuditLogResponse | null>(null)
	const [page, setPage] = useState(1)
	const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS)
	const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [verification, setVerification] = useState<ChainVerification | null>(null)
	const [isVerifying, setIsVerifying] = useState(false)

	const fetchLogs = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch(
				`${API_URL}/api/admin/audit-logs?${auditQueryString(filters, page)}`,
				{ credentials: "include" }
			)
			if (!res.ok) throw new Error("Failed to fetch audit logs")
			setData(await res.json())
			setError(null)
		} catch {
			setError("Error loading audit logs")
		} finally {
			setLoading(false)
		}
	}, [filters, page])

	useEffect(() => {
		void fetchLogs()
	}, [fetchLogs])

	const applyFilters = (event: React.FormEvent) => {
		event.preventDefault()
		setPage(1)
		setFilters(draft)
	}

	const resetFilters = () => {
		setDraft(EMPTY_FILTERS)
		setFilters(EMPTY_FILTERS)
		setPage(1)
	}

	const verifyChain = async () => {
		setIsVerifying(true)
		try {
			const res = await fetch(`${API_URL}/api/admin/audit-logs/verify`, {
				credentials: "include",
			})
			if (!res.ok) throw new Error("verification failed")
			setVerification(await res.json())
		} catch {
			setError("Could not verify the audit trail")
		} finally {
			setIsVerifying(false)
		}
	}

	const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
	const exportHref = `${API_URL}/api/admin/audit-logs/export.csv?${auditQueryString(filters)}`

	return (
		<div className="p-4 sm:p-6">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-bold">Audit Log</h1>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onClick={() => void verifyChain()} disabled={isVerifying}>
						<ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
						{isVerifying ? "Verifying…" : "Verify integrity"}
					</Button>
					<Button variant="outline" size="sm" asChild>
						<a href={exportHref} download>
							<Download className="mr-2 h-4 w-4" aria-hidden="true" />
							Export CSV
						</a>
					</Button>
				</div>
			</div>

			{verification && (
				<div
					role="status"
					className={`mb-4 flex items-start gap-2 rounded-md border p-3 text-sm ${
						verification.intact ? "border-primary/40 bg-primary/5" : "border-destructive bg-destructive/10"
					}`}
				>
					{verification.intact ? (
						<ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
					) : (
						<ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
					)}
					<p>
						{verification.intact
							? `All ${verification.checked} chained entries are intact.`
							: `Tampering detected at entry #${verification.brokenAtSequence}: ${
									PROBLEM_DESCRIPTIONS[verification.problem ?? ""] ?? "the chain does not verify"
								}.`}
						{verification.unchainedLegacyEntries > 0 &&
							` ${verification.unchainedLegacyEntries} entries predate tamper-evidence and cannot be verified.`}
					</p>
				</div>
			)}

			<form
				onSubmit={applyFilters}
				className="mb-4 grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-4"
				aria-label="Filter audit events"
			>
				{FILTER_FIELDS.map((field) => (
					<div key={field.key} className="space-y-1">
						<Label htmlFor={`audit-filter-${field.key}`} className="text-xs">
							{field.label}
						</Label>
						<Input
							id={`audit-filter-${field.key}`}
							type={field.type ?? "text"}
							value={draft[field.key]}
							onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
							className="h-8"
						/>
					</div>
				))}
				<div className="flex items-end gap-2">
					<Button type="submit" size="sm">
						Apply
					</Button>
					<Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
						Reset
					</Button>
				</div>
			</form>

			{error && <p className="mb-4 text-sm text-destructive">{error}</p>}

			<div className="overflow-x-auto rounded-md border">
				<Table>
					<thead className="bg-muted/50">
						<tr>
							<th scope="col" className="py-3 px-4 text-left font-medium">#</th>
							<th scope="col" className="py-3 px-4 text-left font-medium">Time</th>
							<th scope="col" className="py-3 px-4 text-left font-medium">Actor</th>
							<th scope="col" className="py-3 px-4 text-left font-medium">Action</th>
							<th scope="col" className="py-3 px-4 text-left font-medium">Target</th>
							<th scope="col" className="py-3 px-4 text-left font-medium">Details</th>
							<th scope="col" className="py-3 px-4 text-left font-medium">IP</th>
						</tr>
					</thead>
					<tbody>
						{loading && !data && (
							<tr className="border-t">
								<td className="py-6 px-4 text-center text-muted-foreground" colSpan={7}>
									Loading audit logs…
								</td>
							</tr>
						)}
						{data?.logs.map((log) => (
							<tr key={log.id} className="border-t hover:bg-muted/50">
								<td className="py-3 px-4 font-mono text-xs text-muted-foreground">
									{log.sequence}
								</td>
								<td
									className="py-3 px-4 whitespace-nowrap"
									title={new Date(log.createdAt).toISOString()}
								>
									{formatDate(log.createdAt)}
								</td>
								<td className="py-3 px-4 truncate max-w-48" title={log.actorId ?? undefined}>
									{actorLabel(log)}
								</td>
								<td className="py-3 px-4">
									<span className="inline-block rounded-full bg-muted px-2 py-1 font-mono text-xs">
										{log.action}
									</span>
								</td>
								<td className="py-3 px-4 text-xs text-muted-foreground" title={log.targetId ?? undefined}>
									{log.targetType}
									{log.targetId ? ` · ${log.targetId.slice(0, 10)}…` : ""}
								</td>
								<td
									className="py-3 px-4 max-w-64 truncate text-xs text-muted-foreground"
									title={[
										log.metadata ? JSON.stringify(log.metadata) : null,
										log.requestId ? `request ${log.requestId}` : null,
										log.userAgent,
									]
										.filter(Boolean)
										.join("\n")}
								>
									{log.metadata ? JSON.stringify(log.metadata) : "—"}
								</td>
								<td className="py-3 px-4 text-xs text-muted-foreground">
									{log.ipAddress ?? "—"}
								</td>
							</tr>
						))}
						{data?.logs.length === 0 && (
							<tr className="border-t">
								<td className="py-6 px-4 text-center text-muted-foreground" colSpan={7}>
									No audit events match these filters.
								</td>
							</tr>
						)}
					</tbody>
				</Table>
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
				<span>
					{data?.total ?? 0} events · page {page} of {totalPages}
				</span>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1 || loading}
						onClick={() => setPage((current) => current - 1)}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages || loading}
						onClick={() => setPage((current) => current + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	)
}
