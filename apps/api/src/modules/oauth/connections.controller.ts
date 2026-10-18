import { Request, Response } from "express"
import { AuthenticatedUser } from "../../types"
import { respondWithError } from "../../lib/http"
import { recordAudit, requestIp } from "../audit/audit.service"
import { listConnectionsOfUser, revokeGrantOfUser } from "./grants.service"
import {
	createPersonalAccessToken,
	listPersonalAccessTokens,
	revokePersonalAccessToken,
} from "./personal-tokens.service"
import { onlyKnownScopes } from "./scopes"
import { confirmIdentity } from "../auth/reauthentication.service"
import { sendAccessTokenCreatedEmail } from "../notifications/email.service"
import { logger } from "../../lib/logger"

const userIdOf = (req: Request): string => (req.user as AuthenticatedUser).id

export const listConnections = async (req: Request, res: Response): Promise<void> => {
	try {
		res.status(200).json(await listConnectionsOfUser(userIdOf(req)))
	} catch (error) {
		respondWithError(res, error, "list connected apps")
	}
}

export const revokeConnection = async (req: Request, res: Response): Promise<void> => {
	try {
		const userId = userIdOf(req)
		const grant = await revokeGrantOfUser(req.params.grantId, userId)
		await recordAudit({
			action: "oauth.grant_revoked",
			targetType: "oauth_grant",
			targetId: grant.id,
			actorId: userId,
			metadata: { clientId: grant.clientId, by: "user" },
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "revoke connected app")
	}
}

export const listTokens = async (req: Request, res: Response): Promise<void> => {
	try {
		res.status(200).json(await listPersonalAccessTokens(userIdOf(req)))
	} catch (error) {
		respondWithError(res, error, "list access tokens")
	}
}

export const createToken = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = req.user as AuthenticatedUser
		const userId = user.id
		await confirmIdentity(
			userId,
			{ password: req.body.password, code: req.body.code, recoveryCode: req.body.recoveryCode },
			req.sessionClaims?.sst
		)
		const created = await createPersonalAccessToken(userId, {
			name: req.body.name,
			scopes: onlyKnownScopes(req.body.scopes),
			expiresInDays: req.body.expiresInDays,
		})
		await recordAudit({
			action: "personal_access_token.created",
			targetType: "personal_access_token",
			targetId: created.id,
			actorId: userId,
			metadata: {
				name: created.name,
				scopes: created.scopes,
				expiresAt: created.expiresAt.toISOString(),
			},
			ipAddress: requestIp(req),
		})
		void sendAccessTokenCreatedEmail({
			to: user.email,
			name: user.name,
			tokenName: created.name,
			scopes: created.scopes,
			expiresAt: created.expiresAt,
		}).catch((error) => logger.error("Failed to send access token notice", error))
		res.status(201).json(created)
	} catch (error) {
		respondWithError(res, error, "create access token")
	}
}

export const revokeToken = async (req: Request, res: Response): Promise<void> => {
	try {
		const userId = userIdOf(req)
		const revoked = await revokePersonalAccessToken(userId, req.params.tokenId)
		await recordAudit({
			action: "personal_access_token.revoked",
			targetType: "personal_access_token",
			targetId: revoked.id,
			actorId: userId,
			metadata: { name: revoked.name },
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "revoke access token")
	}
}
