import { Router, Request, Response, NextFunction } from "express"
import passport from "passport"
import {
	register,
	login,
	logout,
	getOAuthProviders,
	oauthCallback,
} from "../controllers/auth.controller"
import { oauthProviders } from "../lib/passport"

const router = Router()

router.post("/register", register)
router.post("/login", login)
router.post("/logout", logout)
router.get("/providers", getOAuthProviders)

const FRONTEND_URL =
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"

// Guard so an unconfigured provider returns a clear error instead of crashing
// with "Unknown authentication strategy".
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

// --- Google ---
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

// --- GitHub ---
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
