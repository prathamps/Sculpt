"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/Header"
import { AiConnectionGuide } from "@/components/AiConnectionGuide"
import { ConnectedAppsSection } from "@/components/ConnectedAppsSection"
import { AccessTokensSection } from "@/components/AccessTokensSection"
import { API_URL } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { IntegrationInfo, integrationsApi } from "@/lib/integrations"

export default function IntegrationsPage() {
	const [info, setInfo] = useState<IntegrationInfo | null>(null)

	useEffect(() => {
		integrationsApi
			.info()
			.then(setInfo)
			.catch((error) => toast.error(describeError(error, "Could not load integration settings.")))
	}, [])

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
				<Link
					href="/account"
					className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-4 w-4" aria-hidden="true" />
					Account settings
				</Link>
				<h1 className="mb-6 text-2xl font-semibold">AI &amp; integrations</h1>

				{!info ? (
					<div className="flex justify-center py-12" role="status">
						<Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
						<span className="sr-only">Loading</span>
					</div>
				) : (
					<div className="flex flex-col gap-6">
						<AiConnectionGuide mcpServerUrl={info.mcpServerUrl} />
						<ConnectedAppsSection scopeDescriptions={info.scopes} />
						<AccessTokensSection scopeDescriptions={info.scopes} apiUrl={API_URL} />
					</div>
				)}
			</main>
		</div>
	)
}
