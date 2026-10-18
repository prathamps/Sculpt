import { RequestHandler, Response } from "express"
import { authAllowsScope, isDelegated } from "../lib/request-auth"
import { SCOPE_DESCRIPTIONS, Scope } from "../modules/oauth/scopes"
import { bearerChallenge } from "../modules/oauth/bearer"

export const SCOPE_REQUIREMENT = Symbol.for("sculpt.scopeRequirement")
export const SESSION_ONLY = Symbol.for("sculpt.sessionOnly")

type TaggedHandler = RequestHandler & {
	[SCOPE_REQUIREMENT]?: Scope
	[SESSION_ONLY]?: true
}

export const INSUFFICIENT_SCOPE = "insufficient_scope"

export const declareScope = <H extends RequestHandler>(handler: H, scope: Scope): H =>
	Object.assign(handler, { [SCOPE_REQUIREMENT]: scope })

export const declaredScopeOf = (handler: unknown): Scope | undefined =>
	(handler as TaggedHandler | undefined)?.[SCOPE_REQUIREMENT]

export const isSessionOnly = (handler: unknown): boolean =>
	(handler as TaggedHandler | undefined)?.[SESSION_ONLY] === true

export const rejectForMissingScope = (res: Response, scope: Scope): void => {
	const { title } = SCOPE_DESCRIPTIONS[scope]
	res.setHeader(
		"WWW-Authenticate",
		bearerChallenge({ error: INSUFFICIENT_SCOPE, scope })
	)
	res.status(403).json({
		code: INSUFFICIENT_SCOPE,
		requiredScope: scope,
		message: `This connection was not granted the "${title}" permission (${scope}). Reconnect it and allow that permission.`,
	})
}

export const requireScope = (scope: Scope): RequestHandler =>
	declareScope((req, res, next) => {
		if (!authAllowsScope(req.auth, scope)) {
			rejectForMissingScope(res, scope)
			return
		}
		next()
	}, scope)

export const sessionOnly: RequestHandler = Object.assign(
	((req, res, next) => {
		if (isDelegated(req.auth)) {
			res.status(403).json({
				code: "session_required",
				message:
					"For your security this can only be done by you in Sculpt, not by a connected app or access token.",
			})
			return
		}
		next()
	}) as RequestHandler,
	{ [SESSION_ONLY]: true as const }
)
