import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./grants.service", () => ({ revokeGrantsOfUser: vi.fn(async () => 2) }))
vi.mock("./personal-tokens.service", () => ({
	revokePersonalAccessTokensOfUser: vi.fn(async () => 1),
}))
vi.mock("../audit/audit.service", () => ({ recordAudit: vi.fn(async () => undefined) }))

import { CredentialChange, endDelegatedAccess, endsPersonalAccessTokens } from "./credential-changes"
import { revokeGrantsOfUser } from "./grants.service"
import { revokePersonalAccessTokensOfUser } from "./personal-tokens.service"
import { recordAudit } from "../audit/audit.service"

const EVERY_CHANGE: CredentialChange[] = [
	"password_changed",
	"password_reset",
	"signed_out_everywhere",
	"mfa_enabled",
	"mfa_disabled",
	"platform_role_changed",
]

describe("endDelegatedAccess", () => {
	beforeEach(() => vi.clearAllMocks())

	it.each(EVERY_CHANGE)("revokes every app connection after %s", async (change) => {
		await endDelegatedAccess("u1", change)

		expect(vi.mocked(revokeGrantsOfUser)).toHaveBeenCalledWith("u1")
	})

	it("also revokes personal access tokens when the password changes, is reset, or every session is ended", () => {
		expect(EVERY_CHANGE.filter(endsPersonalAccessTokens)).toEqual([
			"password_changed",
			"password_reset",
			"signed_out_everywhere",
		])
	})

	it("keeps personal access tokens when two-factor settings or the platform role change", async () => {
		await endDelegatedAccess("u1", "mfa_enabled")

		expect(vi.mocked(revokePersonalAccessTokensOfUser)).not.toHaveBeenCalled()
	})

	it("audits what was revoked and who caused it", async () => {
		const ended = await endDelegatedAccess("u1", "password_reset", "u1")

		expect(ended).toEqual({ connections: 2, personalAccessTokens: 1 })
		expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "oauth.delegated_access_ended",
				targetId: "u1",
				actorId: "u1",
				metadata: { reason: "password_reset", connections: 2, personalAccessTokens: 1 },
			})
		)
	})

	it("writes no audit entry when there was nothing to revoke", async () => {
		vi.mocked(revokeGrantsOfUser).mockResolvedValueOnce(0)

		await endDelegatedAccess("u1", "mfa_disabled")

		expect(vi.mocked(recordAudit)).not.toHaveBeenCalled()
	})
})
