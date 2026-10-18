"use client"

import { useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { BadgeCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { Paginated, api } from "@/lib/api"
import { describeError } from "@/lib/errors"

interface OAuthClientRow {
	id: string
	kind: "DYNAMIC" | "METADATA_DOCUMENT" | "FIRST_PARTY"
	name: string
	clientUri: string | null
	redirectUris: string[]
	tokenEndpointAuthMethod: string
	verifiedAt: string | null
	disabledAt: string | null
	lastUsedAt: string | null
	createdAt: string
	activeGrants: number
}

const KIND_LABELS: Record<OAuthClientRow["kind"], string> = {
	DYNAMIC: "Self-registered",
	METADATA_DOCUMENT: "Metadata document",
	FIRST_PARTY: "First party",
}

interface ClientUpdate {
	disabled?: boolean
	verified?: boolean
}

const UPDATE_CONFIRMATIONS = {
	disabled: (name: string) => `${name} was disabled.`,
	enabled: (name: string) => `${name} was enabled.`,
	verified: (name: string) => `${name} is now shown as verified.`,
	unverified: (name: string) => `${name} is no longer verified.`,
}

const confirmationFor = (update: ClientUpdate, name: string): string => {
	if (update.disabled !== undefined) {
		return (update.disabled ? UPDATE_CONFIRMATIONS.disabled : UPDATE_CONFIRMATIONS.enabled)(name)
	}
	return (update.verified ? UPDATE_CONFIRMATIONS.verified : UPDATE_CONFIRMATIONS.unverified)(name)
}

const hostOf = (uri: string): string => {
	try {
		return new URL(uri).host || uri
	} catch {
		return uri
	}
}

export function AdminOAuthClients() {
	const [page, setPage] = useState(1)
	const [result, setResult] = useState<Paginated<OAuthClientRow> | null>(null)
	const [pending, setPending] = useState<OAuthClientRow | null>(null)
	const [isSaving, setIsSaving] = useState(false)

	const load = useCallback(async () => {
		try {
			setResult(await api.get<Paginated<OAuthClientRow>>(`/api/admin/oauth-clients?page=${page}`))
		} catch (error) {
			toast.error(describeError(error, "Could not load connected apps."))
		}
	}, [page])

	useEffect(() => {
		void load()
	}, [load])

	const update = async (client: OAuthClientRow, change: ClientUpdate) => {
		setIsSaving(true)
		try {
			await api.patch(`/api/admin/oauth-clients/${encodeURIComponent(client.id)}`, change)
			toast.success(confirmationFor(change, client.name))
			setPending(null)
			await load()
		} catch (error) {
			toast.error(describeError(error, "Could not update the app."))
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-semibold">Connected apps</h1>
				<p className="text-sm text-muted-foreground">
					AI assistants and other OAuth clients that have registered with this Sculpt. Verify the ones
					you trust so people see them as verified on the consent screen; anyone can register an app
					under any name. Disabling one disconnects everyone who uses it, immediately.
				</p>
			</div>

			{!result ? (
				<div className="flex justify-center py-12" role="status">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
					<span className="sr-only">Loading</span>
				</div>
			) : result.items.length === 0 ? (
				<p className="text-sm text-muted-foreground">No apps have registered yet.</p>
			) : (
				<div className="overflow-x-auto rounded-md border border-border">
					<table className="w-full min-w-[640px] text-sm">
						<thead className="bg-muted/50 text-left text-xs text-muted-foreground">
							<tr>
								<th scope="col" className="px-3 py-2 font-medium">App</th>
								<th scope="col" className="px-3 py-2 font-medium">Redirects to</th>
								<th scope="col" className="px-3 py-2 font-medium">People connected</th>
								<th scope="col" className="px-3 py-2 font-medium">Last used</th>
								<th scope="col" className="px-3 py-2 font-medium">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{result.items.map((client) => (
								<tr key={client.id}>
									<td className="px-3 py-2">
										<p className="flex items-center gap-1 font-medium">
											{client.name}
											{client.verifiedAt && (
												<BadgeCheck className="h-4 w-4 text-primary" aria-label="Verified" />
											)}
										</p>
										<p className="text-xs text-muted-foreground">
											{KIND_LABELS[client.kind]}
											{client.kind === "METADATA_DOCUMENT" ? ` · published at ${hostOf(client.id)}` : ""}
											{client.disabledAt ? " · disabled" : ""}
										</p>
									</td>
									<td className="px-3 py-2 font-mono text-xs">
										{Array.from(new Set(client.redirectUris.map(hostOf))).join(", ")}
									</td>
									<td className="px-3 py-2">{client.activeGrants}</td>
									<td className="px-3 py-2 text-muted-foreground">
										{client.lastUsedAt
											? formatDistanceToNow(new Date(client.lastUsedAt), { addSuffix: true })
											: "never"}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-right">
										<div className="flex justify-end gap-2">
											<Button
												size="sm"
												variant="ghost"
												disabled={isSaving}
												onClick={() => void update(client, { verified: !client.verifiedAt })}
												aria-label={`${client.verifiedAt ? "Remove verification from" : "Verify"} ${client.name}`}
											>
												{client.verifiedAt ? "Unverify" : "Verify"}
											</Button>
											{client.disabledAt ? (
												<Button
													size="sm"
													variant="outline"
													disabled={isSaving}
													onClick={() => void update(client, { disabled: false })}
													aria-label={`Enable ${client.name}`}
												>
													Enable
												</Button>
											) : (
												<Button
													size="sm"
													variant="outline"
													className="text-destructive"
													onClick={() => setPending(client)}
													aria-label={`Disable ${client.name}`}
												>
													Disable
												</Button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{result && result.totalPages > 1 && (
				<div className="flex items-center justify-end gap-2">
					<Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
						Previous
					</Button>
					<span className="text-sm text-muted-foreground">
						Page {result.page} of {result.totalPages}
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={page >= result.totalPages}
						onClick={() => setPage(page + 1)}
					>
						Next
					</Button>
				</div>
			)}

			<ConfirmationModal
				isOpen={!!pending}
				onClose={() => setPending(null)}
				onConfirm={() => pending && void update(pending, { disabled: true })}
				isConfirming={isSaving}
				title={`Disable ${pending?.name ?? "this app"}?`}
				description={`Everyone connected through it (${pending?.activeGrants ?? 0}) is disconnected now and it cannot be authorized again until you enable it.`}
				confirmText="Disable"
			/>
		</div>
	)
}
