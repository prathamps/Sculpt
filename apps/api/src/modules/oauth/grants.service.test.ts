import { beforeEach, describe, expect, it, vi } from "vitest"

interface GrantRow {
	id: string
	userId: string
	clientId: string
	resource: string
	scopes: string[]
	requestedScopes: string[]
	tokenVersion: number
	revokedAt: Date | null
	createdAt: Date
}

const db = vi.hoisted(() => ({
	grants: [] as GrantRow[],
	refreshTokens: [] as { tokenHash: string; grantId: string }[],
	codes: [] as { codeHash: string; grantId: string }[],
	nextId: 1,
}))

vi.mock("../../lib/prisma", () => {
	const matches = (row: GrantRow, where: Partial<GrantRow>) =>
		Object.entries(where).every(([key, value]) => row[key as keyof GrantRow] === value)
	const store = {
		$executeRaw: vi.fn(async () => 1),
		oAuthGrant: {
			findFirst: vi.fn(async ({ where }: { where: Partial<GrantRow> }) =>
				[...db.grants].reverse().find((row) => matches(row, where)) ?? null
			),
			findMany: vi.fn(async ({ where }: { where: Partial<GrantRow> }) =>
				db.grants.filter((row) => matches(row, where))
			),
			update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<GrantRow> }) => {
				const row = db.grants.find((grant) => grant.id === where.id)!
				Object.assign(row, data)
				return row
			}),
			updateMany: vi.fn(async ({ where, data }: { where: Partial<GrantRow>; data: Partial<GrantRow> }) => {
				const rows = db.grants.filter((row) => matches(row, where))
				rows.forEach((row) => Object.assign(row, data))
				return { count: rows.length }
			}),
			create: vi.fn(async ({ data }: { data: Omit<GrantRow, "id" | "revokedAt" | "createdAt"> }) => {
				const row = { ...data, id: `grant-${db.nextId++}`, revokedAt: null, createdAt: new Date() }
				db.grants.push(row)
				return row
			}),
		},
		oAuthRefreshToken: {
			deleteMany: vi.fn(async ({ where }: { where: { grantId: string } }) => {
				db.refreshTokens = db.refreshTokens.filter((token) => token.grantId !== where.grantId)
				return { count: 0 }
			}),
		},
		oAuthAuthorizationCode: {
			deleteMany: vi.fn(async ({ where }: { where: { grantId: string } }) => {
				db.codes = db.codes.filter((code) => code.grantId !== where.grantId)
				return { count: 0 }
			}),
		},
		user: { findUnique: vi.fn(async () => ({ tokenVersion: 1 })) },
	}
	return {
		prisma: {
			...store,
			$transaction: vi.fn(async (work: (tx: typeof store) => Promise<unknown>) => work(store)),
		},
	}
})

import { prisma } from "../../lib/prisma"
import { listConnectionsOfUser, recordConsent, revokeGrantsOfUser } from "./grants.service"

const consent = (tokenVersion: number) =>
	recordConsent({
		userId: "u1",
		clientId: "claude",
		resource: "http://localhost:3002/mcp",
		scopes: ["sculpt:read"],
		requestedScopes: ["sculpt:read", "sculpt:manage"],
		tokenVersion,
	})

describe("recordConsent", () => {
	beforeEach(() => {
		db.grants = []
		db.refreshTokens = []
		db.codes = []
		vi.clearAllMocks()
	})

	it("never revives refresh tokens issued before a credential change", async () => {
		const before = await consent(0)
		db.refreshTokens.push({ tokenHash: "stolen", grantId: before.id })

		const after = await consent(1)

		expect(after.id).not.toBe(before.id)
		expect(db.grants.find((grant) => grant.id === before.id)?.revokedAt).toBeInstanceOf(Date)
		expect(db.refreshTokens).toEqual([])
	})

	it("updates the existing connection in place when credentials have not changed", async () => {
		const first = await consent(1)
		db.refreshTokens.push({ tokenHash: "current", grantId: first.id })

		const second = await consent(1)

		expect(second.id).toBe(first.id)
		expect(db.refreshTokens).toHaveLength(1)
	})

	it("remembers what the app asked for alongside what the person allowed", async () => {
		const grant = await consent(1)

		expect(db.grants.find((row) => row.id === grant.id)).toMatchObject({
			scopes: ["sculpt:read"],
			requestedScopes: ["sculpt:read", "sculpt:manage"],
		})
	})

	it("serialises concurrent consents for the same app with a lock", async () => {
		await consent(1)

		expect(vi.mocked(prisma.$executeRaw)).toHaveBeenCalled()
	})
})

describe("revokeGrantsOfUser", () => {
	it("revokes every live connection of the person and deletes their refresh tokens", async () => {
		db.grants = []
		db.refreshTokens = []
		const grant = await consent(1)
		db.refreshTokens.push({ tokenHash: "t", grantId: grant.id })

		expect(await revokeGrantsOfUser("u1")).toBe(1)
		expect(db.refreshTokens).toEqual([])
	})
})

describe("listConnectionsOfUser", () => {
	it("hides connections made before the person's latest credential change", async () => {
		await listConnectionsOfUser("u1")

		expect(vi.mocked(prisma.oAuthGrant.findMany)).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ userId: "u1", revokedAt: null, tokenVersion: 1 }),
			})
		)
	})
})
