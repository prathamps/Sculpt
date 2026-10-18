import { Request, Response } from "express"
import { AuthenticatedUser } from "../../types"
import { respondWithError } from "../../lib/http"
import { AuditAction, recordAudit, recordAuditOnce, requestIp } from "../audit/audit.service"
import { ClientUpdate, listClientsForAdmin, updateClientByAdmin } from "./clients.service"

const adminIdOf = (req: Request): string => (req.user as AuthenticatedUser).id

export const listOAuthClients = async (req: Request, res: Response): Promise<void> => {
	try {
		const adminId = adminIdOf(req)
		const clients = await listClientsForAdmin(req.query)
		await recordAuditOnce(`${adminId}:oauth-clients`, {
			action: "admin.oauth_clients_viewed",
			targetType: "oauth_client",
			actorId: adminId,
		})
		res.status(200).json(clients)
	} catch (error) {
		respondWithError(res, error, "list OAuth clients")
	}
}

const auditedActionsOf = (update: ClientUpdate): AuditAction[] => [
	...(update.disabled === undefined
		? []
		: [update.disabled ? ("oauth.client_disabled" as const) : ("oauth.client_enabled" as const)]),
	...(update.verified === undefined
		? []
		: [update.verified ? ("oauth.client_verified" as const) : ("oauth.client_unverified" as const)]),
]

export const updateOAuthClient = async (req: Request, res: Response): Promise<void> => {
	try {
		const adminId = adminIdOf(req)
		const update: ClientUpdate = { disabled: req.body.disabled, verified: req.body.verified }
		const updated = await updateClientByAdmin(req.params.clientId, update)
		for (const action of auditedActionsOf(update)) {
			await recordAudit({
				action,
				targetType: "oauth_client",
				targetId: updated.id,
				actorId: adminId,
				metadata: { name: updated.name, revokedGrants: updated.revokedGrants },
				ipAddress: requestIp(req),
			})
		}
		res.status(200).json(updated)
	} catch (error) {
		respondWithError(res, error, "update OAuth client")
	}
}
