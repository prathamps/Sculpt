import { describe, expect, it } from "vitest"
import { ConsentDetails, identityWarningFor, initialConsentSelection } from "./integrations"

const identity = {
	verified: false,
	identityHost: null,
	redirectHost: "agent.example",
	runsLocally: false,
	nameMatchesHost: true,
	registeredAt: null,
}

const scopeDescriptionsFor = (scopes: string[]) => scopes.map((scope) => ({ scope, title: scope, description: scope }))

const details = (overrides: Partial<ConsentDetails>): ConsentDetails =>
	({
		client: { id: "c", name: "Agent", kind: "DYNAMIC", clientUri: null, logoUri: null, verified: false },
		identity,
		redirectHost: "agent.example",
		resource: { url: "http://localhost:3002/mcp", kind: "mcp" },
		scopes: scopeDescriptionsFor(["sculpt:read", "sculpt:feedback", "sculpt:content", "sculpt:manage", "sculpt:account"]),
		recommendedScopes: ["sculpt:read", "sculpt:feedback", "sculpt:content"],
		previouslyGranted: [],
		rememberedScopes: [],
		autoApprove: false,
		...overrides,
	}) as ConsentDetails

describe("initialConsentSelection", () => {
	it("starts with only the everyday permissions ticked", () => {
		expect([...initialConsentSelection(details({}))]).toEqual(["sculpt:read", "sculpt:feedback", "sculpt:content"])
	})

	it("keeps permissions the person granted this app before", () => {
		expect(initialConsentSelection(details({ previouslyGranted: ["sculpt:manage"] })).has("sculpt:manage")).toBe(true)
	})
})

describe("identityWarningFor", () => {
	it("reassures only for apps an administrator verified", () => {
		expect(identityWarningFor({ ...identity, verified: true })).toBe("verified")
	})

	it("warns that apps running on the person's computer cannot be checked", () => {
		expect(identityWarningFor({ ...identity, runsLocally: true })).toBe("local")
	})

	it("warns loudly when the app's name does not match where it sends people", () => {
		expect(identityWarningFor({ ...identity, nameMatchesHost: false })).toBe("mismatch")
		expect(identityWarningFor(identity)).toBe("unverified")
	})
})
