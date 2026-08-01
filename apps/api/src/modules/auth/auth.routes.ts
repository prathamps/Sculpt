import { Router, Request, Response, NextFunction } from "express"
import passport from "passport"
import {
	register,
	login,
	logout,
	getOAuthProviders,
	oauthCallback,
	requestPasswordReset,
	completePasswordReset,
} from "./auth.controller"
import { oauthProviders } from "./passport"
import { validateBody } from "../../middleware/validate.middleware"
import {
	completePasswordResetSchema,
	loginSchema,
	registerSchema,
	requestPasswordResetSchema,
} from "./auth.schema"
import {
	loginRateLimit,
	passwordResetRateLimit,
	registerRateLimit,
} from "../../middleware/rate-limit.middleware"

const router = Router()

router.post(
	"/register",
	registerRateLimit(),
	validateBody(registerSchema),
	register
)
router.post("/login", loginRateLimit(), validateBody(loginSchema), login)
router.post("/logout", logout)
router.get("/providers", getOAuthProviders)

router.post(
	"/password-reset/request",
	passwordResetRateLimit(),
	validateBody(requestPasswordResetSchema),
	requestPasswordReset
)
router.post(
	"/password-reset/complete",
	passwordResetRateLimit(),
	validateBody(completePasswordResetSchema),
	completePasswordReset
)

const FRONTEND_URL =
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"

const requireProvider =
	(provider: "google" | "github") =>
	(_req: Request, res: Response, next: NextFunction) => {
		if (!oauthProviders[provider]) {
			return res
				.status(503)
				.json({ message: `${provider} login is not configured on this server.` })
		}
		next()
	}

router.get(
	"/google",
	requireProvider("google"),
	passport.authenticate("google", { scope: ["profile", "email"], session: false })
)
router.get(
	"/google/callback",
	requireProvider("google"),
	passport.authenticate("google", {
		session: false,
		failureRedirect: `${FRONTEND_URL}/login?error=oauth`,
	}),
	oauthCallback
)

router.get(
	"/github",
	requireProvider("github"),
	passport.authenticate("github", { scope: ["user:email"], session: false })
)
router.get(
	"/github/callback",
	requireProvider("github"),
	passport.authenticate("github", {
		session: false,
		failureRedirect: `${FRONTEND_URL}/login?error=oauth`,
	}),
	oauthCallback
)

export default router
