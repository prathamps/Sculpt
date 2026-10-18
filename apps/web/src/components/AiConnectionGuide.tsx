"use client"

import { useEffect, useState } from "react"
import { Bot, Check, ClipboardCopy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { CopyableLink } from "@/components/CopyableLink"
import { clientSetupsFor } from "@/lib/integrations"

const COPIED_FEEDBACK_MS = 2000

function Snippet({ value, label }: { value: string; label: string }) {
	const [hasCopied, setHasCopied] = useState(false)

	useEffect(() => {
		if (!hasCopied) return
		const timer = setTimeout(() => setHasCopied(false), COPIED_FEEDBACK_MS)
		return () => clearTimeout(timer)
	}, [hasCopied])

	return (
		<div className="relative">
			<pre
				className="max-w-full overflow-x-auto rounded-md border border-border bg-muted/50 p-3 pr-20 font-mono text-xs"
				aria-label={label}
			>
				{value}
			</pre>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="absolute right-2 top-2 h-7 gap-1"
				onClick={() => {
					void navigator.clipboard.writeText(value).then(() => setHasCopied(true))
				}}
				aria-label={`Copy ${label}`}
			>
				{hasCopied ? (
					<Check className="h-3.5 w-3.5" aria-hidden="true" />
				) : (
					<ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
				)}
				{hasCopied ? "Copied" : "Copy"}
			</Button>
		</div>
	)
}

export function AiConnectionGuide({ mcpServerUrl }: { mcpServerUrl: string | null }) {
	const setups = mcpServerUrl ? clientSetupsFor(mcpServerUrl) : []
	const [chosen, setChosen] = useState(setups[0]?.id ?? "")
	const setup = setups.find((candidate) => candidate.id === chosen) ?? setups[0]

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Bot className="h-4 w-4" aria-hidden="true" />
					Connect an AI assistant
				</CardTitle>
				<CardDescription>
					Let Claude, ChatGPT, Cursor and other assistants work in Sculpt for you: review media, leave
					anchored comments, upload versions, approve work and keep projects organised. You approve
					every connection and can disconnect it at any time.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{!mcpServerUrl ? (
					<p className="text-sm text-muted-foreground">
						This Sculpt server has no MCP endpoint configured yet. An administrator can enable it by
						deploying the MCP service and setting MCP_RESOURCE_URL. Personal access tokens below still
						work with the REST API.
					</p>
				) : (
					<>
						<div className="space-y-2">
							<p className="text-sm font-medium">MCP server URL</p>
							<CopyableLink url={mcpServerUrl} label="Sculpt MCP server URL" />
						</div>

						<div className="space-y-3">
							<div
								className="flex flex-wrap gap-2"
								role="group"
								aria-label="Choose your assistant"
							>
								{setups.map((candidate) => (
									<Button
										key={candidate.id}
										type="button"
										size="sm"
										variant={candidate.id === setup?.id ? "default" : "outline"}
										aria-pressed={candidate.id === setup?.id}
										onClick={() => setChosen(candidate.id)}
									>
										{candidate.name}
									</Button>
								))}
							</div>

							{setup && (
								<div className="space-y-3">
									<ol className="list-decimal space-y-1 pl-5 text-sm">
										{setup.steps.map((step) => (
											<li key={step}>{step}</li>
										))}
									</ol>
									{setup.snippet && (
										<Snippet value={setup.snippet} label={setup.snippetLabel ?? "Configuration"} />
									)}
								</div>
							)}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	)
}
