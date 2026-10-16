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
import { verifyMfaChallengeHandler } from "./mfa.controller"
import { recordAudit } from "../audit/audit.service"
import {
	completePasswordResetSchema,
	secondFactorSchema,
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
router.post(
	"/mfa/verify",
	loginRateLimit(),
	validateBody(secondFactorSchema),
	verifyMfaChallengeHandler
)
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
const completeProviderSignIn =
	(provider: "google" | "github") =>
	(req: Request, res: Response, next: NextFunction) =>
		passport.authenticate(
			provider,
			{ session: false },
			(error: unknown, user: Express.User | false) => {
				if (error || !user) {
					void recordAudit({
						action: "user.oauth_login_failed",
						targetType: "user",
						metadata: { provider, reason: error ? "provider_error" : "rejected" },
					})
					return res.redirect(`${FRONTEND_URL}/login?error=oauth`)
				}
				req.user = user
				next()
			}
		)(req, res, next)

router.get(
	"/google/callback",
	requireProvider("google"),
	completeProviderSignIn("google"),
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
	completeProviderSignIn("github"),
	oauthCallback
)

export default router
