import { OAuthClientKind } from "@prisma/client"
import { ResolvedClient } from "./clients.service"
import { isLoopbackHttpUrl } from "./client-metadata"

const MIN_NAME_WORD_LENGTH = 3
const GENERIC_NAME_WORDS = new Set(["app", "the", "client", "mcp", "and", "for", "desktop", "code"])

export interface ClientIdentity {
	verified: boolean
	identityHost: string | null
	redirectHost: string
	runsLocally: boolean
	nameMatchesHost: boolean
	registeredAt: string | null
}

const parsedUrl = (value: string): URL | null => {
	try {
		return new URL(value)
	} catch {
		return null
	}
}

export const redirectRunsLocally = (redirectUri: string): boolean => {
	const url = parsedUrl(redirectUri)
	if (!url) return false
	return isLoopbackHttpUrl(url) || (url.protocol !== "https:" && url.protocol !== "http:")
}

export const identityHostOf = (client: Pick<ResolvedClient, "id" | "kind">): string | null =>
	client.kind === OAuthClientKind.METADATA_DOCUMENT ? (parsedUrl(client.id)?.host ?? null) : null

const distinctiveWordsOf = (name: string): string[] =>
	name
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length >= MIN_NAME_WORD_LENGTH && !GENERIC_NAME_WORDS.has(word))

const hostLabelsOf = (host: string): string[] =>
	host.toLowerCase().replace(/:\d+$/, "").split(".").slice(0, -1)

export const nameMatchesHost = (name: string, host: string): boolean => {
	const labels = hostLabelsOf(host)
	return distinctiveWordsOf(name).some((word) => labels.some((label) => label.includes(word)))
}

export const describeClientIdentity = (
	client: ResolvedClient,
	redirectUri: string,
	redirectHost: string
): ClientIdentity => {
	const identityHost = identityHostOf(client)
	const runsLocally = redirectRunsLocally(redirectUri)
	const verified = client.verified || client.kind === OAuthClientKind.FIRST_PARTY
	return {
		verified,
		identityHost,
		redirectHost,
		runsLocally,
		nameMatchesHost:
			!runsLocally && nameMatchesHost(client.name, identityHost ?? redirectHost),
		registeredAt:
			client.kind === OAuthClientKind.DYNAMIC && client.registeredAt
				? client.registeredAt.toISOString()
				: null,
	}
}
