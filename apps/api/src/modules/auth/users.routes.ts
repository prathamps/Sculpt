import { Router, Request, Response } from "express"
import { z } from "zod"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import {
	changePassword,
	deleteMyAccount,
	exportMyData,
	updateNotificationPreferences,
	updateProfile,
} from "./users.controller"
import {
	changePasswordSchema,
	disableMfaSchema,
	enableMfaSchema,
	secondFactorSchema,
	updateProfileSchema,
} from "./auth.schema"
import {
	disableMfaHandler,
	enableMfa,
	getMfaStatus,
	regenerateMfaRecoveryCodes,
	startMfaSetup,
} from "./mfa.controller"
import { loginRateLimit } from "../../middleware/rate-limit.middleware"
import { requireScope, sessionOnly } from "../../middleware/scope.middleware"
import {
	createToken,
	listConnections,
	listTokens,
	revokeConnection,
	revokeToken,
} from "../oauth/connections.controller"
import { createPersonalTokenSchema } from "../oauth/oauth.schema"

const notificationPreferencesSchema = z
	.object({
		emailNotifications: z.boolean(),
		emailOnMention: z.boolean(),
		emailOnComment: z.boolean(),
		emailOnReply: z.boolean(),
		emailOnReview: z.boolean(),
	})
	.partial()
	.refine((body) => Object.keys(body).length > 0, {
		message: "Choose at least one preference to change",
	})

const deleteAccountSchema = z.object({
	password: z.string().min(1).optional(),
	deleteOwnedProjects: z.boolean().default(false),
})

const router = Router()

router.use(authenticateJWT)

const currentUser = (req: Request, res: Response) => res.json(req.user)

router.get("/profile", requireScope("sculpt:read"), currentUser)
router.get("/me", requireScope("sculpt:read"), currentUser)

router.patch(
	"/me",
	requireScope("sculpt:account"),
	validateBody(updateProfileSchema),
	updateProfile
)
router.post(
	"/me/password",
	sessionOnly,
	validateBody(changePasswordSchema),
	changePassword
)
router.patch(
	"/me/notification-preferences",
	requireScope("sculpt:account"),
	validateBody(notificationPreferencesSchema),
	updateNotificationPreferences
)
router.get("/me/export", sessionOnly, exportMyData)
router.get("/me/mfa", sessionOnly, getMfaStatus)
router.post("/me/mfa/setup", sessionOnly, startMfaSetup)
router.post(
	"/me/mfa/enable",
	sessionOnly,
	loginRateLimit(),
	validateBody(enableMfaSchema),
	enableMfa
)
router.post(
	"/me/mfa/recovery-codes",
	sessionOnly,
	loginRateLimit(),
	validateBody(secondFactorSchema),
	regenerateMfaRecoveryCodes
)
router.post(
	"/me/mfa/disable",
	sessionOnly,
	loginRateLimit(),
	validateBody(disableMfaSchema),
	disableMfaHandler
)
router.delete("/me", sessionOnly, validateBody(deleteAccountSchema), deleteMyAccount)

router.get("/me/connections", sessionOnly, listConnections)
router.delete("/me/connections/:grantId", sessionOnly, revokeConnection)
router.get("/me/tokens", sessionOnly, listTokens)
router.post(
	"/me/tokens",
	sessionOnly,
	validateBody(createPersonalTokenSchema),
	createToken
)
router.delete("/me/tokens/:tokenId", sessionOnly, revokeToken)

export default router
