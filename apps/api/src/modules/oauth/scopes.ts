import { ProjectRole } from "@prisma/client"

export const SCOPES = [
	"sculpt:read",
	"sculpt:feedback",
	"sculpt:content",
	"sculpt:manage",
	"sculpt:account",
] as const

export type Scope = (typeof SCOPES)[number]

export const EVERYDAY_SCOPES: readonly Scope[] = ["sculpt:read", "sculpt:feedback", "sculpt:content"]

export interface ScopeDescription {
	scope: Scope
	title: string
	description: string
}

export const SCOPE_DESCRIPTIONS: Record<Scope, ScopeDescription> = {
	"sculpt:read": {
		scope: "sculpt:read",
		title: "View your work",
		description: "See projects, files, comments and reviews.",
	},
	"sculpt:feedback": {
		scope: "sculpt:feedback",
		title: "Give feedback",
		description: "Comment, annotate, resolve threads and approve work.",
	},
	"sculpt:content": {
		scope: "sculpt:content",
		title: "Manage files",
		description: "Upload files and versions, organise and delete them.",
	},
	"sculpt:manage": {
		scope: "sculpt:manage",
		title: "Administer projects",
		description: "Invite people, change roles, share links and delete projects.",
	},
	"sculpt:account": {
		scope: "sculpt:account",
		title: "Update your profile",
		description: "Change your name and email notifications.",
	},
}

const SCOPE_FOR_MINIMUM_ROLE: Record<ProjectRole, Scope> = {
	VIEWER: "sculpt:read",
	MEMBER: "sculpt:feedback",
	EDITOR: "sculpt:content",
	OWNER: "sculpt:manage",
}

export const scopeForMinimumRole = (minimum: ProjectRole): Scope =>
	SCOPE_FOR_MINIMUM_ROLE[minimum]

export const isScope = (value: string): value is Scope =>
	(SCOPES as readonly string[]).includes(value)

export const SCOPE_SEPARATOR = " "

export interface ParsedScopes {
	scopes: Scope[]
	unknown: string[]
}

export const parseScopeString = (raw: string | null | undefined): ParsedScopes => {
	const requested = (raw ?? "")
		.split(SCOPE_SEPARATOR)
		.map((entry) => entry.trim())
		.filter(Boolean)
	const unique = Array.from(new Set(requested))
	return {
		scopes: SCOPES.filter((scope) => unique.includes(scope)),
		unknown: unique.filter((entry) => !isScope(entry)),
	}
}

export const formatScopes = (scopes: readonly string[]): string =>
	SCOPES.filter((scope) => scopes.includes(scope)).join(SCOPE_SEPARATOR)

export const narrowScopes = (
	granted: readonly string[],
	requested: readonly string[]
): Scope[] => SCOPES.filter((scope) => granted.includes(scope) && requested.includes(scope))

export const onlyKnownScopes = (values: readonly string[]): Scope[] =>
	SCOPES.filter((scope) => values.includes(scope))
