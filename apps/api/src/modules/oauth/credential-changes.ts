import { recordAudit } from "../audit/audit.service"
import { revokeGrantsOfUser } from "./grants.service"
import { revokePersonalAccessTokensOfUser } from "./personal-tokens.service"

export type CredentialChange =
	| "password_changed"
	| "password_reset"
	| "signed_out_everywhere"
	| "mfa_enabled"
	| "mfa_disabled"
	| "platform_role_changed"

const ENDS_PERSONAL_ACCESS_TOKENS: ReadonlySet<CredentialChange> = new Set([
	"password_changed",
	"password_reset",
	"signed_out_everywhere",
])

export const endsPersonalAccessTokens = (change: CredentialChange): boolean =>
	ENDS_PERSONAL_ACCESS_TOKENS.has(change)

export const endDelegatedAccess = async (
	userId: string,
	change: CredentialChange,
	actorId: string = userId
): Promise<{ connections: number; personalAccessTokens: number }> => {
	const connections = await revokeGrantsOfUser(userId)
	const personalAccessTokens = endsPersonalAccessTokens(change)
		? await revokePersonalAccessTokensOfUser(userId)
		: 0
	if (connections + personalAccessTokens > 0) {
		await recordAudit({
			action: "oauth.delegated_access_ended",
			targetType: "user",
			targetId: userId,
			actorId,
			metadata: { reason: change, connections, personalAccessTokens },
		})
	}
	return { connections, personalAccessTokens }
}
