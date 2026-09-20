import passport from "passport"
import { Strategy as JwtStrategy } from "passport-jwt"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { Strategy as GitHubStrategy } from "passport-github2"
import { Request } from "express"
import { prisma } from "../../lib/prisma"
import { jwtSecret } from "../../lib/config"
import { SESSION_COOKIE } from "../../lib/cookies"
import { findOrCreateOAuthUser } from "./auth.service"
import { isSessionRevoked } from "./session.service"
import { SessionClaims } from "../../lib/tokens"
import { CookieOAuthStateStore } from "./oauth-state"
import { logger } from "../../lib/logger"

const cookieExtractor = (req: Request) => {
	let token = null
	if (req && req.cookies) {
		token = req.cookies[SESSION_COOKIE]
	}
	return token
}

const opts = {
	jwtFromRequest: cookieExtractor,
	secretOrKey: jwtSecret(),
	passReqToCallback: true as const,
}

passport.use(
	new JwtStrategy(opts, async (req: Request, jwt_payload, done) => {
		try {
			if (jwt_payload?.typ !== "user") return done(null, false)
			if (typeof jwt_payload?.ver !== "number") return done(null, false)
			if (typeof jwt_payload?.jti !== "string") return done(null, false)
			if (await isSessionRevoked(jwt_payload.jti)) return done(null, false)
			const user = await prisma.user.findUnique({
				where: { id: jwt_payload.id },
			})
			if (!user) return done(null, false)
			if (user.tokenVersion !== jwt_payload.ver) return done(null, false)
			req.sessionClaims = jwt_payload as SessionClaims
			return done(null, user)
		} catch (error) {
			return done(error, false)
		}
	})
)

const API_URL = process.env.API_URL || "http://localhost:3001"

const STATE_STORE_ENABLED = true as unknown as string

const csrfProtectedState = () => ({
	state: STATE_STORE_ENABLED,
	store: new CookieOAuthStateStore(),
})

interface GitHubEmailEntry {
	email: string
	verified: boolean
	primary: boolean
}

const fetchVerifiedGitHubEmail = async (
	accessToken: string
): Promise<string | null> => {
	try {
		const response = await fetch("https://api.github.com/user/emails", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"User-Agent": "sculpt-api",
			},
		})
		if (!response.ok) return null
		const entries = (await response.json()) as GitHubEmailEntry[]
		if (!Array.isArray(entries)) return null
		const verified = entries.filter((entry) => entry?.verified && entry.email)
		return (
			verified.find((entry) => entry.primary)?.email ??
			verified[0]?.email ??
			null
		)
	} catch {
		return null
	}
}

export const oauthProviders = {
	google: false,
	github: false,
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
	passport.use(
		new GoogleStrategy(
			{
				clientID: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET,
				callbackURL:
					process.env.GOOGLE_CALLBACK_URL ||
					`${API_URL}/api/auth/google/callback`,
				...csrfProtectedState(),
			},
			async (_accessToken, _refreshToken, profile, done) => {
				try {
					const primaryEmail = profile.emails?.[0]
					if (!primaryEmail?.value) {
						return done(null, false)
					}
					const claims = profile._json as { email_verified?: boolean | string }
					const emailVerified =
						String(primaryEmail.verified) === "true" ||
						String(claims?.email_verified) === "true"
					const user = await findOrCreateOAuthUser({
						provider: "google",
						providerId: profile.id,
						email: primaryEmail.value,
						emailVerified,
						name: profile.displayName,
						avatarUrl: profile.photos?.[0]?.value ?? null,
					})
					return done(null, user ?? false)
				} catch (error) {
					return done(error as Error)
				}
			}
		)
	)
	oauthProviders.google = true
	logger.info("Google OAuth enabled")
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
	passport.use(
		new GitHubStrategy(
			{
				clientID: process.env.GITHUB_CLIENT_ID,
				clientSecret: process.env.GITHUB_CLIENT_SECRET,
				callbackURL:
					process.env.GITHUB_CALLBACK_URL ||
					`${API_URL}/api/auth/github/callback`,
				scope: ["user:email"],
				...csrfProtectedState(),
			},
			async (
				accessToken: string,
				_refreshToken: string,
				profile: any,
				done: (error: any, user?: any) => void
			) => {
				try {
					const verifiedEmail = await fetchVerifiedGitHubEmail(accessToken)
					const email =
						verifiedEmail ||
						profile.emails?.[0]?.value ||
						`${profile.username}@users.noreply.github.com`
					const user = await findOrCreateOAuthUser({
						provider: "github",
						providerId: String(profile.id),
						email,
						emailVerified: !!verifiedEmail,
						name: profile.displayName || profile.username,
						avatarUrl: profile.photos?.[0]?.value ?? null,
					})
					return done(null, user ?? false)
				} catch (error) {
					return done(error)
				}
			}
		)
	)
	oauthProviders.github = true
	logger.info("GitHub OAuth enabled")
}

export default passport
