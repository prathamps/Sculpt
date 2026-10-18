"use client"

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
	BadgeCheck,
	ChevronDown,
	Eye,
	FolderUp,
	Laptop,
	Loader2,
	type LucideIcon,
	MessageSquare,
	ShieldAlert,
	UserCog,
	Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/context/AuthContext"
import { ApiError } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { cn } from "@/lib/utils"
import {
	ConsentDetails,
	Scope,
	ScopeDescription,
	identityWarningFor,
	initialConsentSelection,
	integrationsApi,
} from "@/lib/integrations"

const AUTHORIZATION_ERRORS: Record<string, string> = {
	missing_client: "The app did not say who it is, so Sculpt cannot connect it.",
	unknown_client: "Sculpt does not recognise this app, or an administrator has turned it off.",
	redirect_uri_mismatch:
		"The app asked Sculpt to send you somewhere it never registered. Sculpt stopped to keep your account safe.",
}

const SCOPE_ICONS: Record<Scope, LucideIcon> = {
	"sculpt:read": Eye,
	"sculpt:feedback": MessageSquare,
	"sculpt:content": FolderUp,
	"sculpt:manage": Users,
	"sculpt:account": UserCog,
}

type Stage = "loading" | "ready" | "redirecting" | "failed"

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh flex-col items-center bg-background px-4 py-8 sm:justify-center sm:py-12">
			<div className="w-full max-w-[26rem] sm:rounded-xl sm:border sm:border-border/60 sm:bg-card sm:p-8 sm:shadow-sm">
				{children}
			</div>
		</main>
	)
}

function AppPair({ name }: { name: string }) {
	return (
		<div className="flex items-center justify-center gap-3" aria-hidden="true">
			<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
				{name.trim().charAt(0).toUpperCase() || "?"}
			</div>
			<div className="flex gap-1">
				<span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
				<span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
				<span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
			</div>
			<div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
				<Image src="/logo.png" alt="" width={28} height={28} />
			</div>
		</div>
	)
}

function TrustNotice({ details }: { details: ConsentDetails }) {
	const { identity } = details
	const warning = identityWarningFor(identity)
	const owner = identity.identityHost ?? identity.redirectHost
	const registered =
		identity.registeredAt && warning !== "local"
			? `Registered ${formatDistanceToNow(new Date(identity.registeredAt), { addSuffix: true })}.`
			: null

	const notices = {
		verified: {
			icon: BadgeCheck,
			tone: "text-muted-foreground",
			text: "Verified by your Sculpt administrator.",
		},
		local: {
			icon: Laptop,
			tone: "text-muted-foreground",
			text: "Runs on your computer. Only continue if you just started connecting it.",
		},
		unverified: {
			icon: ShieldAlert,
			tone: "text-muted-foreground",
			text: `Not verified by Sculpt. Belongs to ${owner}.`,
		},
		mismatch: {
			icon: ShieldAlert,
			tone: "text-destructive",
			text: `This app's name doesn't match ${owner}. Only continue if you trust that site.`,
		},
	}
	const notice = notices[warning]
	const Icon = notice.icon

	return (
		<div
			className={cn(
				"flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
				warning === "mismatch" ? "bg-destructive/10" : "bg-muted/60"
			)}
			role={warning === "mismatch" ? "alert" : undefined}
		>
			<Icon className={cn("mt-0.5 h-4 w-4 shrink-0", notice.tone)} aria-hidden="true" />
			<p className={cn("min-w-0 break-words", warning === "mismatch" && "text-destructive")}>
				{notice.text}
				{registered && <span className="text-muted-foreground"> {registered}</span>}
			</p>
		</div>
	)
}

function PermissionRow({
	scope,
	checked,
	disabled,
	onChange,
}: {
	scope: ScopeDescription
	checked: boolean
	disabled: boolean
	onChange: (checked: boolean) => void
}) {
	const id = useId()
	const Icon = SCOPE_ICONS[scope.scope]
	return (
		<li className="flex items-center gap-3 px-3 py-3">
			<Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
				<span className="block text-sm font-medium">{scope.title}</span>
				<span className="block text-xs text-muted-foreground">{scope.description}</span>
			</label>
			<Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
		</li>
	)
}

function ConsentForm({
	details,
	selected,
	onToggle,
	onDecide,
	isSubmitting,
	email,
}: {
	details: ConsentDetails
	selected: Set<Scope>
	onToggle: (scope: Scope, checked: boolean) => void
	onDecide: (approved: boolean) => void
	isSubmitting: boolean
	email: string | undefined
}) {
	const everyday = details.scopes.filter((scope) => details.recommendedScopes.includes(scope.scope))
	const extra = details.scopes.filter((scope) => !details.recommendedScopes.includes(scope.scope))
	const [showExtra, setShowExtra] = useState(() => extra.some((scope) => selected.has(scope.scope)))
	const extraListId = useId()

	const rows = (scopes: ScopeDescription[]) =>
		scopes.map((scope) => (
			<PermissionRow
				key={scope.scope}
				scope={scope}
				checked={selected.has(scope.scope)}
				disabled={isSubmitting}
				onChange={(checked) => onToggle(scope.scope, checked)}
			/>
		))

	return (
		<div className="space-y-6">
			<div className="space-y-4 text-center">
				<AppPair name={details.client.name} />
				<div className="space-y-1">
					<h1 className="text-xl font-semibold tracking-tight">Connect {details.client.name}</h1>
					{email && (
						<p className="break-all text-sm text-muted-foreground">
							to Sculpt as <span className="font-medium text-foreground">{email}</span>
						</p>
					)}
				</div>
			</div>

			<TrustNotice details={details} />

			<section aria-labelledby="permissions-heading" className="space-y-2">
				<h2 id="permissions-heading" className="text-sm font-medium">
					Allow it to
				</h2>
				{everyday.length > 0 && (
					<ul className="divide-y divide-border rounded-lg border border-border">{rows(everyday)}</ul>
				)}
				{extra.length > 0 && (
					<div>
						<button
							type="button"
							className="flex w-full items-center justify-between rounded-md py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-expanded={showExtra}
							aria-controls={extraListId}
							onClick={() => setShowExtra((open) => !open)}
						>
							More access you can allow ({extra.length})
							<ChevronDown
								className={cn("h-4 w-4 transition-transform", showExtra && "rotate-180")}
								aria-hidden="true"
							/>
						</button>
						{showExtra && (
							<ul id={extraListId} className="divide-y divide-border rounded-lg border border-border">
								{rows(extra)}
							</ul>
						)}
					</div>
				)}
			</section>

			<div className="space-y-2">
				<Button
					className="w-full"
					onClick={() => onDecide(true)}
					disabled={isSubmitting || selected.size === 0}
				>
					{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
					Allow access
				</Button>
				<Button variant="ghost" className="w-full" onClick={() => onDecide(false)} disabled={isSubmitting}>
					Cancel
				</Button>
			</div>

			<p className="text-center text-xs text-muted-foreground">
				Limited to your role in each project. Disconnect any time in{" "}
				<Link href="/account/integrations" className="whitespace-nowrap text-primary hover:underline">
					AI &amp; integrations
				</Link>
				.
			</p>
		</div>
	)
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
	return (
		<Shell>
			<div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
				<p className="text-sm text-muted-foreground">{children}</p>
			</div>
		</Shell>
	)
}

function Problem({ title, message }: { title: string; message: string }) {
	return (
		<Shell>
			<div className="space-y-4 text-center" role="alert">
				<Image src="/logo.png" alt="" width={36} height={36} className="mx-auto" aria-hidden="true" />
				<div className="space-y-1">
					<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
					<p className="text-sm text-muted-foreground">{message}</p>
				</div>
				<Button asChild variant="outline" className="w-full">
					<Link href="/dashboard">Go to your dashboard</Link>
				</Button>
			</div>
		</Shell>
	)
}

function ConsentPageInner() {
	const searchParams = useSearchParams()
	const request = searchParams.get("request")
	const authorizationError = searchParams.get("error")
	const { user } = useAuth()
	const [stage, setStage] = useState<Stage>("loading")
	const [details, setDetails] = useState<ConsentDetails | null>(null)
	const [selected, setSelected] = useState<Set<Scope>>(new Set())
	const [failure, setFailure] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const autoApproved = useRef(false)

	const sendBack = useCallback((redirectTo: string) => {
		setStage("redirecting")
		window.location.assign(redirectTo)
	}, [])

	const decide = useCallback(
		async (approved: boolean, scopes?: Scope[]) => {
			if (!request) return
			setIsSubmitting(true)
			try {
				const { redirectTo } = await integrationsApi.decideConsent(request, approved, scopes)
				sendBack(redirectTo)
			} catch (error) {
				setFailure(describeError(error, "Sculpt could not record your decision."))
				setStage("failed")
			} finally {
				setIsSubmitting(false)
			}
		},
		[request, sendBack]
	)

	useEffect(() => {
		if (!request) return
		integrationsApi
			.consentDetails(request)
			.then((loaded) => {
				setDetails(loaded)
				setSelected(initialConsentSelection(loaded))
				setStage("ready")
				if (loaded.autoApprove && !autoApproved.current) {
					autoApproved.current = true
					void decide(true, loaded.rememberedScopes)
				}
			})
			.catch((error) => {
				if (error instanceof ApiError && error.isUnauthorized) {
					window.location.assign(
						`/login?next=${encodeURIComponent(`/consent?request=${encodeURIComponent(request)}`)}`
					)
					return
				}
				setFailure(describeError(error, "Sculpt could not load this request."))
				setStage("failed")
			})
	}, [request, decide])

	if (authorizationError || !request) {
		return (
			<Problem
				title="This app could not connect"
				message={
					AUTHORIZATION_ERRORS[authorizationError ?? ""] ??
					"The connection request is incomplete. Start again from the app you were connecting."
				}
			/>
		)
	}

	if (stage === "failed") {
		return <Problem title="Something went wrong" message={failure ?? ""} />
	}

	if (stage === "loading" || stage === "redirecting" || !details || details.autoApprove) {
		return (
			<CenteredMessage>
				{stage === "redirecting" || details?.autoApprove
					? `Taking you back to ${details?.client.name ?? "the app"}…`
					: "Checking the request…"}
			</CenteredMessage>
		)
	}

	return (
		<Shell>
			<ConsentForm
				details={details}
				selected={selected}
				email={user?.email}
				isSubmitting={isSubmitting}
				onToggle={(scope, checked) =>
					setSelected((current) => {
						const next = new Set(current)
						if (checked) next.add(scope)
						else next.delete(scope)
						return next
					})
				}
				onDecide={(approved) => void decide(approved, approved ? [...selected] : undefined)}
			/>
		</Shell>
	)
}

export default function ConsentPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-dvh items-center justify-center bg-background">
					<Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
					<span className="sr-only">Loading</span>
				</div>
			}
		>
			<ConsentPageInner />
		</Suspense>
	)
}
