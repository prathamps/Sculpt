import { describe, expect, it, vi } from "vitest"
import { Request, Response } from "express"
import { RequestAuth, SESSION_AUTH } from "../lib/request-auth"
import { requireScope, sessionOnly } from "./scope.middleware"

const delegated = (scopes: string[]): RequestAuth => ({
	method: "oauth",
	scopes: new Set(scopes),
	clientId: "client-1",
	grantId: "grant-1",
	tokenId: "jti",
	actorClientId: "sculpt-mcp",
})

const makeResponse = () => {
	const res = {
		statusCode: 0,
		body: undefined as unknown,
		headers: {} as Record<string, string>,
		setHeader(name: string, value: string) {
			this.headers[name.toLowerCase()] = value
		},
		status(code: number) {
			this.statusCode = code
			return this
		},
		json(payload: unknown) {
			this.body = payload
			return this
		},
	}
	return res as unknown as Response & typeof res
}

const run = (handler: ReturnType<typeof requireScope>, auth: RequestAuth) => {
	const res = makeResponse()
	const next = vi.fn()
	handler({ auth } as Request, res, next)
	return { res, next }
}

describe("requireScope", () => {
	it("lets browser sessions through, since they carry the person's full authority", () => {
		expect(run(requireScope("sculpt:manage"), SESSION_AUTH).next).toHaveBeenCalled()
	})

	it("lets a token through when it was granted the scope", () => {
		expect(run(requireScope("sculpt:read"), delegated(["sculpt:read"])).next).toHaveBeenCalled()
	})

	it("refuses a token without the scope and tells the client which scope to ask for", () => {
		const { res, next } = run(requireScope("sculpt:content"), delegated(["sculpt:read"]))
		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(403)
		expect(res.body).toMatchObject({ code: "insufficient_scope", requiredScope: "sculpt:content" })
		expect(res.headers["www-authenticate"]).toContain('error="insufficient_scope"')
		expect(res.headers["www-authenticate"]).toContain('scope="sculpt:content"')
	})
})

describe("sessionOnly", () => {
	it("allows a signed-in person", () => {
		const next = vi.fn()
		sessionOnly({ auth: SESSION_AUTH } as Request, makeResponse(), next)
		expect(next).toHaveBeenCalled()
	})

	it("refuses connected apps and access tokens whatever their scopes", () => {
		const res = makeResponse()
		const next = vi.fn()
		sessionOnly(
			{ auth: delegated(["sculpt:read", "sculpt:manage", "sculpt:account"]) } as Request,
			res,
			next
		)
		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(403)
	})
})
