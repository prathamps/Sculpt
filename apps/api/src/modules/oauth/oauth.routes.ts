import express, { Router } from "express"
import cors from "cors"
import {
	authorize,
	introspect,
	issueToken,
	registerClient,
	revoke,
	serveApiResourceMetadata,
	serveAuthorizationServerMetadata,
	serveJwks,
} from "./oauth.controller"
import { getConsentDetails, getIntegrationInfo, submitConsent } from "./consent.controller"
import { OAUTH_PATHS } from "./metadata"
import { presentsMcpServiceCredentials } from "./clients.service"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { sessionOnly } from "../../middleware/scope.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import {
	oauthAuthorizeRateLimit,
	oauthRegistrationRateLimit,
	oauthTokenRateLimit,
	writeRateLimit,
} from "../../middleware/rate-limit.middleware"
import { consentDecisionSchema, consentDetailsSchema } from "./oauth.schema"

const OAUTH_BODY_LIMIT = "64kb"

const anyOriginWithoutCredentials = cors({
	origin: "*",
	credentials: false,
	methods: ["GET", "POST", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "MCP-Protocol-Version"],
	maxAge: 600,
})

const formOrJsonBody = [
	express.urlencoded({ extended: false, limit: OAUTH_BODY_LIMIT }),
	express.json({ limit: OAUTH_BODY_LIMIT }),
]

const oauthPublicRouter = Router()

oauthPublicRouter.use(
	["/.well-known", "/oauth/token", "/oauth/register", "/oauth/revoke", "/oauth/introspect", OAUTH_PATHS.jwks],
	anyOriginWithoutCredentials
)

oauthPublicRouter.get("/.well-known/oauth-authorization-server", serveAuthorizationServerMetadata)
oauthPublicRouter.get("/.well-known/oauth-protected-resource", serveApiResourceMetadata)
oauthPublicRouter.get(OAUTH_PATHS.jwks, serveJwks)
oauthPublicRouter.get(OAUTH_PATHS.authorize, oauthAuthorizeRateLimit(), authorize)
oauthPublicRouter.post(
	OAUTH_PATHS.register,
	oauthRegistrationRateLimit(),
	express.json({ limit: OAUTH_BODY_LIMIT }),
	registerClient
)
oauthPublicRouter.post(
	OAUTH_PATHS.token,
	formOrJsonBody,
	oauthTokenRateLimit(presentsMcpServiceCredentials),
	issueToken
)
oauthPublicRouter.post(
	OAUTH_PATHS.revoke,
	formOrJsonBody,
	oauthTokenRateLimit(presentsMcpServiceCredentials),
	revoke
)
oauthPublicRouter.post(
	OAUTH_PATHS.introspect,
	formOrJsonBody,
	oauthTokenRateLimit(presentsMcpServiceCredentials),
	introspect
)

const consentRouter = Router()

consentRouter.get("/integration", getIntegrationInfo)
consentRouter.post(
	"/consent/details",
	authenticateJWT,
	sessionOnly,
	validateBody(consentDetailsSchema),
	getConsentDetails
)
consentRouter.post(
	"/consent",
	authenticateJWT,
	sessionOnly,
	writeRateLimit(),
	validateBody(consentDecisionSchema),
	submitConsent
)

export { oauthPublicRouter, consentRouter }
