import { Request, Response } from "express"
import { AuthenticatedUser } from "../../types"
import { respondWithError } from "../../lib/http"
import { recordAudit, requestIp } from "../audit/audit.service"
import { decideConsent, describeConsent } from "./authorization.service"
import { SCOPES, SCOPE_DESCRIPTIONS } from "./scopes"
import { mcpResource, oauthIssuer } from "./oauth.config"

const userOf = (req: Request): AuthenticatedUser => req.user as AuthenticatedUser

export const getConsentDetails = async (req: Request, res: Response): Promise<void> => {
	try {
		res.status(200).json(await describeConsent(req.body.request, userOf(req)))
	} catch (error) {
		respondWithError(res, error, "describe consent")
	}
}

export const submitConsent = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = userOf(req)
		const result = await decideConsent(req.body.request, user, {
			approved: req.body.approved,
			scopes: req.body.scopes,
		})
		await recordAudit({
			action: result.approved ? "oauth.consent_granted" : "oauth.consent_denied",
			targetType: "oauth_client",
			targetId: result.clientId,
			actorId: user.id,
			metadata: { scopes: result.scopes, resource: result.resource },
			ipAddress: requestIp(req),
		})
		res.status(200).json({ redirectTo: result.redirectTo })
	} catch (error) {
		respondWithError(res, error, "record consent")
	}
}

export const getIntegrationInfo = (_req: Request, res: Response): void => {
	res.setHeader("Cache-Control", "public, max-age=300")
	res.status(200).json({
		mcpServerUrl: mcpResource(),
		authorizationServer: oauthIssuer(),
		scopes: SCOPES.map((scope) => SCOPE_DESCRIPTIONS[scope]),
	})
}
