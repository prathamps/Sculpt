export type AuthMethod = "session" | "oauth" | "personal_access_token"

export interface RequestAuth {
	method: AuthMethod
	scopes: ReadonlySet<string> | null
	clientId: string | null
	grantId: string | null
	tokenId: string | null
	actorClientId: string | null
}

export const SESSION_AUTH: RequestAuth = Object.freeze({
	method: "session",
	scopes: null,
	clientId: null,
	grantId: null,
	tokenId: null,
	actorClientId: null,
})

export const isDelegated = (auth: RequestAuth | undefined): boolean =>
	!!auth && auth.method !== "session"

export const authAllowsScope = (auth: RequestAuth | undefined, scope: string): boolean => {
	if (!auth || auth.scopes === null) return true
	return auth.scopes.has(scope)
}

export interface Delegation {
	via: Exclude<AuthMethod, "session">
	clientId?: string
	grantId?: string
	tokenId?: string
	actingThrough?: string
}

export const delegationOf = (auth: RequestAuth | undefined): Delegation | null => {
	if (!auth || auth.method === "session") return null
	return {
		via: auth.method,
		...(auth.clientId ? { clientId: auth.clientId } : {}),
		...(auth.grantId ? { grantId: auth.grantId } : {}),
		...(auth.tokenId ? { tokenId: auth.tokenId } : {}),
		...(auth.actorClientId ? { actingThrough: auth.actorClientId } : {}),
	}
}
