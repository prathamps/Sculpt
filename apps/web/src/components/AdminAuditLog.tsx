"use client"

import { useState, useEffect, useCallback } from "react"
import { Table } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
const PAGE_SIZE = 25

interface AuditLogEntry {
	id: string
	action: string
	targetType: string
	targetId: string | null
	metadata: Record<string, unknown> | null
	ipAddress: string | null
	createdAt: string
	actor: { id: string; email: string; name: string | null } | null
}

interface AuditLogResponse {
	total: number
	page: number
	pageSize: number
	logs: AuditLogEntry[]
}

export function AdminAuditLog() {
	const [data, setData] = useState<AuditLogResponse | null>(null)
	const [page, setPage] = useState(1)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const fetchLogs = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch(
				`${API_URL}/api/admin/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`,
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
	}, [page])

	useEffect(() => {
		fetchLogs()
	}, [fetchLogs])

	if (loading && !data) {
		return <div className="p-6">Loading audit logs...</div>
	}

	if (error) {
		return <div className="p-6 text-red-500">{error}</div>
	}

	const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold mb-6">Audit Log</h1>

			<div className="border rounded-md">
				<Table>
					<thead className="bg-muted/50">
						<tr>
							<th className="py-3 px-4 text-left font-medium">Time</th>
							<th className="py-3 px-4 text-left font-medium">Actor</th>
							<th className="py-3 px-4 text-left font-medium">Action</th>
							<th className="py-3 px-4 text-left font-medium">Target</th>
							<th className="py-3 px-4 text-left font-medium">Details</th>
							<th className="py-3 px-4 text-left font-medium">IP</th>
						</tr>
					</thead>
					<tbody>
						{data?.logs.map((log) => (
							<tr key={log.id} className="border-t hover:bg-muted/50">
								<td
									className="py-3 px-4 whitespace-nowrap"
									title={new Date(log.createdAt).toLocaleString()}
								>
									{formatDate(log.createdAt)}
								</td>
								<td className="py-3 px-4 truncate max-w-48">
									{log.actor?.email ?? "—"}
								</td>
								<td className="py-3 px-4">
									<span className="inline-block rounded-full bg-muted px-2 py-1 font-mono text-xs">
										{log.action}
									</span>
								</td>
								<td className="py-3 px-4 text-xs text-muted-foreground">
									{log.targetType}
									{log.targetId ? ` · ${log.targetId.slice(0, 10)}…` : ""}
								</td>
								<td className="py-3 px-4 max-w-64 truncate text-xs text-muted-foreground">
									{log.metadata ? JSON.stringify(log.metadata) : "—"}
								</td>
								<td className="py-3 px-4 text-xs text-muted-foreground">
									{log.ipAddress ?? "—"}
								</td>
							</tr>
						))}
						{data?.logs.length === 0 && (
							<tr className="border-t">
								<td
									className="py-6 px-4 text-center text-muted-foreground"
									colSpan={6}
								>
									No audit events recorded yet.
								</td>
							</tr>
						)}
					</tbody>
				</Table>
			</div>

			<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
				<span>
					{data?.total ?? 0} events · page {page} of {totalPages}
				</span>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1 || loading}
						onClick={() => setPage((p) => p - 1)}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages || loading}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	)
}
