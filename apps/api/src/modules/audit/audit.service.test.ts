import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		$transaction: vi.fn(),
		$executeRaw: vi.fn(),
		auditLog: {
			create: vi.fn(),
			count: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
		},
		user: {
			findMany: vi.fn(),
		},
	},
}))

import { prisma } from "../../lib/prisma"
import { runWithRequestContext } from "../../lib/request-context"
import {
	ChainedAuditFields,
	auditEntryHash,
	canonicalJson,
	forgetRecordedAudits,
	listAuditLogs,
	recordAudit,
	recordAuditOnce,
	verifyAuditChain,
} from "./audit.service"

const mocked = vi.mocked(prisma, true)

const createdData = () =>
	(mocked.auditLog.create.mock.calls[mocked.auditLog.create.mock.calls.length - 1]?.[0] as { data: ChainedAuditFields & { hash: string } })
		.data

beforeEach(() => {
	vi.clearAllMocks()
	mocked.auditLog.findMany.mockReset()
	forgetRecordedAudits()
	mocked.$transaction.mockImplementation((async (run: (tx: unknown) => unknown) =>
		run(prisma)) as never)
	mocked.auditLog.findFirst.mockResolvedValue(null)
	mocked.auditLog.create.mockResolvedValue({ sequence: 1, hash: "h" } as never)
	mocked.user.findMany.mockResolvedValue([])
})

describe("recordAudit", () => {
	it("persists actor, target and ip, and serializes writes behind a database lock", async () => {
		await recordAudit({
			action: "project.created",
			targetType: "project",
			targetId: "p1",
			actorId: "u1",
			metadata: { name: "Site" },
			ipAddress: "10.0.0.1",
		})

		expect(mocked.$executeRaw).toHaveBeenCalled()
		expect(createdData()).toMatchObject({
			action: "project.created",
			targetType: "project",
			targetId: "p1",
			actorId: "u1",
			metadata: { name: "Site" },
			ipAddress: "10.0.0.1",
			sequence: 1,
			prevHash: null,
		})
	})

	it("links each entry to the hash of the one before it", async () => {
		mocked.auditLog.findFirst.mockResolvedValue({ sequence: 41, hash: "previous-hash" } as never)

		await recordAudit({ action: "user.logged_out", targetType: "user", targetId: "u1" })

		const { hash, ...fields } = createdData()
		expect(fields.sequence).toBe(42)
		expect(fields.prevHash).toBe("previous-hash")
		expect(hash).toBe(auditEntryHash(fields))
	})

	it("captures the request id, user agent and address of the request being served", async () => {
		await runWithRequestContext(
			{ requestId: "req-12345678", ipAddress: "192.0.2.4", userAgent: "Browser/1.0" },
			() => recordAudit({ action: "media.downloaded", targetType: "imageVersion", targetId: "v1" })
		)

		expect(createdData()).toMatchObject({
			requestId: "req-12345678",
			ipAddress: "192.0.2.4",
			userAgent: "Browser/1.0",
		})
	})

	it("never fails the calling request when the write fails", async () => {
		mocked.$transaction.mockRejectedValue(new Error("db down"))

		await expect(
			recordAudit({ action: "user.login_succeeded", targetType: "user", targetId: "u1" })
		).resolves.toBeUndefined()
	})
})

describe("recordAuditOnce", () => {
	it("records a repeated event only once inside the window", async () => {
		const entry = { action: "media.accessed" as const, targetType: "imageVersion", actorId: "u1" }

		await recordAuditOnce("u1:file.mp4", entry)
		await recordAuditOnce("u1:file.mp4", entry)
		await recordAuditOnce("u2:file.mp4", entry)

		expect(mocked.auditLog.create).toHaveBeenCalledTimes(2)
	})
})

describe("canonicalJson", () => {
	it("hashes the same content identically whatever the key order", () => {
		expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
			canonicalJson({ a: { c: 3, d: 2 }, b: 1 })
		)
	})
})

const chainOf = (count: number) => {
	const entries: (ChainedAuditFields & { hash: string; id: string })[] = []
	for (let index = 1; index <= count; index++) {
		const fields: ChainedAuditFields = {
			sequence: index,
			createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
			action: "project.updated",
			targetType: "project",
			targetId: "p1",
			actorId: "u1",
			metadata: { name: `Name ${index}` },
			ipAddress: "10.0.0.1",
			userAgent: null,
			requestId: null,
			prevHash: entries[entries.length - 1]?.hash ?? null,
		}
		entries.push({ ...fields, id: `a${index}`, hash: auditEntryHash(fields) })
	}
	return entries
}

const serveChain = (entries: unknown[]) =>
	mocked.auditLog.findMany.mockResolvedValueOnce(entries as never).mockResolvedValueOnce([])

describe("verifyAuditChain", () => {
	it("confirms an untouched chain", async () => {
		serveChain(chainOf(3))

		const result = await verifyAuditChain()

		expect(result).toMatchObject({ intact: true, checked: 3, firstSequence: 1, lastSequence: 3 })
	})

	it("detects an entry whose content was edited in the database", async () => {
		const entries = chainOf(3)
		entries[1] = { ...entries[1]!, actorId: "someone-else" }
		serveChain(entries)

		expect(await verifyAuditChain()).toMatchObject({
			intact: false,
			brokenAtSequence: 2,
			problem: "content_changed",
		})
	})

	it("detects an entry deleted from the middle of the trail", async () => {
		const entries = chainOf(4)
		serveChain([entries[0], entries[2], entries[3]])

		expect(await verifyAuditChain()).toMatchObject({
			intact: false,
			brokenAtSequence: 3,
			problem: "entries_missing",
		})
	})

	it("accepts a trail whose oldest entries were removed by retention", async () => {
		serveChain(chainOf(5).slice(2))

		expect(await verifyAuditChain()).toMatchObject({ intact: true, checked: 3, firstSequence: 3 })
	})

	it("counts entries written before chaining existed without failing them", async () => {
		const legacy = { sequence: 1, hash: null, prevHash: null, createdAt: new Date(0) }
		const [firstEntry, secondEntry] = chainOf(2)
		const { hash: _firstOld, id: _firstId, ...firstFields } = firstEntry!
		const first = { ...firstFields, sequence: 2, prevHash: null }
		const firstHash = auditEntryHash(first)
		const { hash: _secondOld, id: _secondId, ...secondFields } = secondEntry!
		const second = { ...secondFields, sequence: 3, prevHash: firstHash }
		serveChain([
			legacy,
			{ ...first, hash: firstHash },
			{ ...second, hash: auditEntryHash(second) },
		])

		expect(await verifyAuditChain()).toMatchObject({
			intact: true,
			checked: 2,
			unchainedLegacyEntries: 1,
		})
	})
})

describe("listAuditLogs", () => {
	beforeEach(() => {
		mocked.auditLog.count.mockResolvedValue(120 as never)
		mocked.auditLog.findMany.mockResolvedValue([] as never)
	})

	it("paginates newest first", async () => {
		const result = await listAuditLogs({ page: 3, pageSize: 25 })

		expect(mocked.auditLog.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 50, take: 25, orderBy: { sequence: "desc" } })
		)
		expect(result).toMatchObject({ total: 120, page: 3, pageSize: 25 })
	})

	it("filters by action, actor, target, address and time window", async () => {
		const from = new Date("2026-01-01T00:00:00.000Z")
		const to = new Date("2026-02-01T00:00:00.000Z")

		await listAuditLogs({
			page: 1,
			pageSize: 10,
			action: "user.login_failed",
			actorId: "u1",
			targetType: "project",
			targetId: "p1",
			ipAddress: "10.0.0.1",
			from,
			to,
		})

		expect(mocked.auditLog.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					action: "user.login_failed",
					actorId: "u1",
					targetType: "project",
					targetId: "p1",
					ipAddress: "10.0.0.1",
					createdAt: { gte: from, lte: to },
				},
			})
		)
	})

	it("keeps entries of deleted accounts attributable by id", async () => {
		mocked.auditLog.findMany.mockResolvedValue([
			{ id: "a1", actorId: "gone-user" },
			{ id: "a2", actorId: "u1" },
		] as never)
		mocked.user.findMany.mockResolvedValue([
			{ id: "u1", email: "ada@example.com", name: "Ada" },
		] as never)

		const { logs } = await listAuditLogs({ page: 1, pageSize: 10 })

		expect(logs[0]).toMatchObject({ actorId: "gone-user", actor: null })
		expect(logs[1]).toMatchObject({ actor: { email: "ada@example.com" } })
	})
})
