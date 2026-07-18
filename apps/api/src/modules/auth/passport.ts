import passport from "passport"
import { Strategy as JwtStrategy } from "passport-jwt"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { Strategy as GitHubStrategy } from "passport-github2"
import { Request } from "express"
import { prisma } from "../../lib/prisma"
import { findOrCreateOAuthUser } from "./auth.service"

const cookieExtractor = (req: Request) => {
	let token = null
	if (req && req.cookies) {
		token = req.cookies["token"]
	}
	return token
}

const opts = {
	jwtFromRequest: cookieExtractor,
	secretOrKey: process.env.JWT_SECRET || "your_jwt_secret",
}

passport.use(
	new JwtStrategy(opts, async (jwt_payload, done) => {
		try {
			const user = await prisma.user.findUnique({
				where: { id: jwt_payload.id },
			})
			if (user) {
				return done(null, user)
			}
			return done(null, false)
		} catch (error) {
			return done(error, false)
		}
	})
)

const API_URL = process.env.API_URL || "http://localhost:3001"

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
			},
			async (_accessToken, _refreshToken, profile, done) => {
				try {
					const email = profile.emails?.[0]?.value
					if (!email) {
						return done(new Error("No email returned from Google"))
					}
					const user = await findOrCreateOAuthUser({
						provider: "google",
						providerId: profile.id,
						email,
						name: profile.displayName,
						avatarUrl: profile.photos?.[0]?.value ?? null,
					})
					return done(null, user)
				} catch (error) {
					return done(error as Error)
				}
			}
		)
	)
	oauthProviders.google = true
	console.log("[auth] Google OAuth enabled")
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
			},
			async (
				_accessToken: string,
				_refreshToken: string,
				profile: any,
				done: (error: any, user?: any) => void
			) => {
				try {
					const email =
						profile.emails?.[0]?.value ||
						`${profile.username}@users.noreply.github.com`
					const user = await findOrCreateOAuthUser({
						provider: "github",
						providerId: String(profile.id),
						email,
						name: profile.displayName || profile.username,
						avatarUrl: profile.photos?.[0]?.value ?? null,
					})
					return done(null, user)
				} catch (error) {
					return done(error)
				}
			}
		)
	)
	oauthProviders.github = true
	console.log("[auth] GitHub OAuth enabled")
}

export default passport
