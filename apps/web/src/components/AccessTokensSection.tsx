"use client"

import { useCallback, useEffect, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { CopyableLink } from "@/components/CopyableLink"
import { ScopeBadges } from "@/components/ConnectedAppsSection"
import { describeError } from "@/lib/errors"
import { ApiError } from "@/lib/api"
import {
	CreatedPersonalAccessToken,
	PersonalAccessToken,
	REAUTHENTICATION_REQUIRED,
	Scope,
	ScopeDescription,
	integrationsApi,
} from "@/lib/integrations"

const EXPIRY_CHOICES = [
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "365", label: "1 year" },
]

const SIGN_IN_AGAIN_URL = `/login?next=${encodeURIComponent("/account/integrations")}`

const DEFAULT_SCOPES: Scope[] = ["sculpt:read"]

function NewTokenForm({
	scopeDescriptions,
	onCreated,
	onCancel,
}: {
	scopeDescriptions: ScopeDescription[]
	onCreated: (token: CreatedPersonalAccessToken) => void
	onCancel: () => void
}) {
	const [name, setName] = useState("")
	const [scopes, setScopes] = useState<Set<Scope>>(new Set(DEFAULT_SCOPES))
	const [expiry, setExpiry] = useState("90")
	const [password, setPassword] = useState("")
	const [code, setCode] = useState("")
	const [isSaving, setIsSaving] = useState(false)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setIsSaving(true)
		try {
			onCreated(
				await integrationsApi.createToken({
					name: name.trim(),
					scopes: [...scopes],
					expiresInDays: Number(expiry),
					...(password ? { password } : {}),
					...(code.trim() ? { code: code.trim() } : {}),
				})
			)
		} catch (error) {
			if (error instanceof ApiError && error.code === REAUTHENTICATION_REQUIRED) {
				toast.error("For your security, sign in again before creating a token.", {
					action: { label: "Sign in", onClick: () => window.location.assign(SIGN_IN_AGAIN_URL) },
				})
				return
			}
			toast.error(describeError(error, "Could not create the token."))
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<form onSubmit={submit} className="space-y-4 rounded-md border border-border p-4">
			<div className="grid gap-2">
				<Label htmlFor="token-name">Name</Label>
				<Input
					id="token-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="e.g. Nightly review agent"
					maxLength={80}
					required
				/>
			</div>
			<fieldset className="space-y-2">
				<legend className="mb-1 text-sm font-medium">Permissions</legend>
				{scopeDescriptions.map((scope) => {
					const id = `new-token-${scope.scope.replace(":", "-")}`
					return (
						<div key={scope.scope} className="flex items-start gap-3">
							<Checkbox
								id={id}
								checked={scopes.has(scope.scope)}
								onCheckedChange={(checked) =>
									setScopes((current) => {
										const next = new Set(current)
										if (checked === true) next.add(scope.scope)
										else next.delete(scope.scope)
										return next
									})
								}
								className="mt-0.5"
							/>
							<div className="grid gap-0.5">
								<Label htmlFor={id}>{scope.title}</Label>
								<p className="text-xs text-muted-foreground">{scope.description}</p>
							</div>
						</div>
					)
				})}
			</fieldset>
			<div className="grid gap-2 sm:max-w-[200px]">
				<Label htmlFor="token-expiry">Expires</Label>
				<Select value={expiry} onValueChange={setExpiry}>
					<SelectTrigger id="token-expiry" aria-label="Token expiry">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{EXPIRY_CHOICES.map((choice) => (
							<SelectItem key={choice.value} value={choice.value}>
								{choice.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<fieldset className="space-y-3 rounded-md bg-muted/40 p-3">
				<legend className="px-1 text-sm font-medium">Confirm it’s you</legend>
				<div className="grid gap-2">
					<Label htmlFor="token-password">Your Sculpt password</Label>
					<Input
						id="token-password"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="Leave blank if you sign in with Google or GitHub"
					/>
				</div>
				{!password && (
					<div className="grid gap-2 sm:max-w-[200px]">
						<Label htmlFor="token-code">Two-factor code</Label>
						<Input
							id="token-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]{6}"
							maxLength={6}
							value={code}
							onChange={(event) => setCode(event.target.value)}
							aria-describedby="token-code-help"
						/>
						<p id="token-code-help" className="text-xs text-muted-foreground">
							Only if you sign in with Google or GitHub and use two-factor authentication.
						</p>
					</div>
				)}
			</fieldset>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSaving || !name.trim() || scopes.size === 0}>
					{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
					Create token
				</Button>
			</div>
		</form>
	)
}

const expiryText = (token: PersonalAccessToken): string => {
	if (token.expired) return "expired"
	if (!token.expiresAt) return "never expires"
	return `expires ${format(new Date(token.expiresAt), "d MMM yyyy")}`
}

export function AccessTokensSection({
	scopeDescriptions,
	apiUrl,
}: {
	scopeDescriptions: ScopeDescription[]
	apiUrl: string
}) {
	const [tokens, setTokens] = useState<PersonalAccessToken[] | null>(null)
	const [isCreating, setIsCreating] = useState(false)
	const [created, setCreated] = useState<CreatedPersonalAccessToken | null>(null)
	const [pending, setPending] = useState<PersonalAccessToken | null>(null)
	const [isRevoking, setIsRevoking] = useState(false)

	const load = useCallback(async () => {
		try {
			setTokens(await integrationsApi.tokens())
		} catch (error) {
			toast.error(describeError(error, "Could not load access tokens."))
			setTokens([])
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	const revoke = async () => {
		if (!pending) return
		setIsRevoking(true)
		try {
			await integrationsApi.revokeToken(pending.id)
			toast.success(`"${pending.name}" was revoked.`)
			if (created?.id === pending.id) setCreated(null)
			setPending(null)
			await load()
		} catch (error) {
			toast.error(describeError(error, "Could not revoke the token."))
		} finally {
			setIsRevoking(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<KeyRound className="h-4 w-4" aria-hidden="true" />
					Personal access tokens
				</CardTitle>
				<CardDescription>
					For scripts, CI jobs and agents that cannot sign in through a browser. Send a token as{" "}
					<code className="font-mono text-xs">Authorization: Bearer …</code> to the MCP server or to{" "}
					<code className="font-mono text-xs">{apiUrl}/api</code>. Tokens never work for password,
					two-factor or account settings.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{created && (
					<div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-4" role="status">
						<p className="text-sm font-medium">Copy your new token now</p>
						<p className="text-xs text-muted-foreground">
							For your security Sculpt shows it only once. Store it like a password.
						</p>
						<CopyableLink url={created.token} label={`New token ${created.name}`} />
						<Button type="button" size="sm" variant="outline" onClick={() => setCreated(null)}>
							Done
						</Button>
					</div>
				)}

				{isCreating ? (
					<NewTokenForm
						scopeDescriptions={scopeDescriptions}
						onCancel={() => setIsCreating(false)}
						onCreated={(token) => {
							setCreated(token)
							setIsCreating(false)
							void load()
						}}
					/>
				) : (
					<Button type="button" variant="outline" className="gap-1" onClick={() => setIsCreating(true)}>
						<Plus className="h-4 w-4" aria-hidden="true" />
						New token
					</Button>
				)}

				{tokens === null ? (
					<div className="flex justify-center py-4" role="status">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
						<span className="sr-only">Loading access tokens</span>
					</div>
				) : tokens.length === 0 ? (
					<p className="text-sm text-muted-foreground">You have no access tokens.</p>
				) : (
					<ul className="divide-y divide-border">
						{tokens.map((token) => (
							<li
								key={token.id}
								className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
							>
								<div className="min-w-0 space-y-1.5">
									<p className="truncate font-medium">
										{token.name}{" "}
										<span className="font-mono text-xs font-normal text-muted-foreground">
											…{token.lastFour}
										</span>
									</p>
									<ScopeBadges scopes={token.scopes} descriptions={scopeDescriptions} />
									<p className="text-xs text-muted-foreground">
										{expiryText(token)} · last used{" "}
										{token.lastUsedAt
											? formatDistanceToNow(new Date(token.lastUsedAt), { addSuffix: true })
											: "never"}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									className="shrink-0 gap-1 text-destructive"
									onClick={() => setPending(token)}
									aria-label={`Revoke ${token.name}`}
								>
									<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
									Revoke
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
				title={`Revoke "${pending?.name ?? "token"}"?`}
				description="Anything using this token stops working immediately. This cannot be undone."
				confirmText="Revoke"
			/>
		</Card>
	)
}
