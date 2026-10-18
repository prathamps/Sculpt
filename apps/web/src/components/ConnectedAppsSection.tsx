"use client"

import { useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Loader2, PlugZap, Unplug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { describeError } from "@/lib/errors"
import {
	Connection,
	ScopeDescription,
	integrationsApi,
} from "@/lib/integrations"

const relativeTime = (iso: string | null, fallback: string): string =>
	iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : fallback

export function ScopeBadges({
	scopes,
	descriptions,
}: {
	scopes: string[]
	descriptions: ScopeDescription[]
}) {
	return (
		<ul className="flex flex-wrap gap-1" aria-label="Permissions">
			{scopes.map((scope) => (
				<li
					key={scope}
					className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
					title={descriptions.find((entry) => entry.scope === scope)?.description}
				>
					{descriptions.find((entry) => entry.scope === scope)?.title ?? scope}
				</li>
			))}
		</ul>
	)
}

export function ConnectedAppsSection({ scopeDescriptions }: { scopeDescriptions: ScopeDescription[] }) {
	const [connections, setConnections] = useState<Connection[] | null>(null)
	const [pending, setPending] = useState<Connection | null>(null)
	const [isRevoking, setIsRevoking] = useState(false)

	const load = useCallback(async () => {
		try {
			setConnections(await integrationsApi.connections())
		} catch (error) {
			toast.error(describeError(error, "Could not load connected apps."))
			setConnections([])
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	const revoke = async () => {
		if (!pending) return
		setIsRevoking(true)
		try {
			await integrationsApi.revokeConnection(pending.id)
			toast.success(`${pending.client.name} was disconnected.`)
			setPending(null)
			await load()
		} catch (error) {
			toast.error(describeError(error, "Could not disconnect the app."))
		} finally {
			setIsRevoking(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<PlugZap className="h-4 w-4" aria-hidden="true" />
					Connected apps
				</CardTitle>
				<CardDescription>
					Assistants and apps you have allowed to act for you. Disconnecting takes effect immediately.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{connections === null ? (
					<div className="flex justify-center py-4" role="status">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
						<span className="sr-only">Loading connected apps</span>
					</div>
				) : connections.length === 0 ? (
					<p className="text-sm text-muted-foreground">No apps are connected yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{connections.map((connection) => (
							<li
								key={connection.id}
								className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
							>
								<div className="min-w-0 space-y-1.5">
									<p className="truncate font-medium">
										{connection.client.name}
										{!connection.client.verified && (
											<span className="ml-2 text-xs font-normal text-muted-foreground">
												{connection.client.redirectHosts.join(", ")}
											</span>
										)}
									</p>
									<ScopeBadges scopes={connection.scopes} descriptions={scopeDescriptions} />
									<p className="text-xs text-muted-foreground">
										Connected {relativeTime(connection.createdAt, "")} · last used{" "}
										{relativeTime(connection.lastUsedAt, "never")}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									className="shrink-0 gap-1 text-destructive"
									onClick={() => setPending(connection)}
									aria-label={`Disconnect ${connection.client.name}`}
								>
									<Unplug className="h-3.5 w-3.5" aria-hidden="true" />
									Disconnect
								</Button>
							</li>
						))}
					</ul>
				)}
			</CardContent>
			<ConfirmationModal
				isOpen={!!pending}
				onClose={() => setPending(null)}
				onConfirm={() => void revoke()}
				isConfirming={isRevoking}
				title={`Disconnect ${pending?.client.name ?? "this app"}?`}
				description="It will stop working in Sculpt immediately. You can connect it again later."
				confirmText="Disconnect"
			/>
		</Card>
	)
}
