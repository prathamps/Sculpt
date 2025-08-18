import passport from "passport"
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import { prisma } from "./prisma"
import { Request } from "express"

const cookieExtractor = (req: Request) => {
	let token = null
	console.log("Cookies: ", req.cookies)
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

export default passport
