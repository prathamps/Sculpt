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

router.get("/profile", currentUser)
router.get("/me", currentUser)

router.patch("/me", validateBody(updateProfileSchema), updateProfile)
router.post("/me/password", validateBody(changePasswordSchema), changePassword)
router.patch(
	"/me/notification-preferences",
	validateBody(notificationPreferencesSchema),
	updateNotificationPreferences
)
router.get("/me/export", exportMyData)
router.get("/me/mfa", getMfaStatus)
router.post("/me/mfa/setup", startMfaSetup)
router.post("/me/mfa/enable", loginRateLimit(), validateBody(enableMfaSchema), enableMfa)
router.post(
	"/me/mfa/recovery-codes",
	loginRateLimit(),
	validateBody(secondFactorSchema),
	regenerateMfaRecoveryCodes
)
router.post(
	"/me/mfa/disable",
	loginRateLimit(),
	validateBody(disableMfaSchema),
	disableMfaHandler
)
router.delete("/me", validateBody(deleteAccountSchema), deleteMyAccount)

export default router
