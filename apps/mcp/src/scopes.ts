export const SCOPES = [
	"sculpt:read",
	"sculpt:feedback",
	"sculpt:content",
	"sculpt:manage",
	"sculpt:account",
] as const

export type Scope = (typeof SCOPES)[number]

export const isScope = (value: string): value is Scope =>
	(SCOPES as readonly string[]).includes(value)

export const scopesFrom = (raw: string | undefined | null): Set<Scope> =>
	new Set(
		(raw ?? "")
			.split(" ")
			.map((entry) => entry.trim())
			.filter(isScope)
	)
