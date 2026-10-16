import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		$transaction: vi.fn(),
		user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
		mfaRecoveryCode: {
			count: vi.fn(),
			deleteMany: vi.fn(),
			createMany: vi.fn(),
			updateMany: vi.fn(),
		},
	},
}))

vi.mock("../audit/audit.service", () => ({ recordAudit: vi.fn() }))

import { prisma } from "../../lib/prisma"
import { recordAudit } from "../audit/audit.service"
import { sealSecret } from "../../lib/secret-box"
import { base32Decode, hotp, totpStepAt } from "../../lib/totp"
import {
	adminMfaRequired,
	beginEnrollment,
	completeEnrollment,
	disableMfa,
	mfaRequiredFor,
	verifySecondFactor,
} from "./mfa.service"

const mocked = vi.mocked(prisma, true)
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
const NOW = 1_700_000_000_000
const codeAt = (ms: number) => hotp(base32Decode(SECRET), totpStepAt(ms))

beforeEach(() => {
	vi.clearAllMocks()
	mocked.$transaction.mockResolvedValue([] as never)
	mocked.user.updateMany.mockResolvedValue({ count: 1 } as never)
})

afterEach(() => {
	delete process.env.MFA_REQUIRED
	delete process.env.ADMIN_MFA_REQUIRED
})

describe("policy", () => {
	it("requires two-factor for administrators unless an operator opts out", () => {
		expect(adminMfaRequired()).toBe(true)
		expect(mfaRequiredFor({ role: "ADMIN" })).toBe(true)
		expect(mfaRequiredFor({ role: "USER" })).toBe(false)

		process.env.ADMIN_MFA_REQUIRED = "false"
		expect(mfaRequiredFor({ role: "ADMIN" })).toBe(false)
	})

	it("can be required for everyone", () => {
		process.env.MFA_REQUIRED = "true"
		expect(mfaRequiredFor({ role: "USER" })).toBe(true)
	})
})

describe("enrollment", () => {
	it("stores the new secret encrypted until it is confirmed", async () => {
		mocked.user.findUnique.mockResolvedValue({ id: "u1", email: "ada@example.com", totpEnabledAt: null } as never)

		const { secret, otpauthUri } = await beginEnrollment("u1")

		const stored = (mocked.user.update.mock.calls[0]![0] as { data: { totpPendingSecret: string } })
			.data.totpPendingSecret
		expect(stored).not.toContain(secret)
		expect(otpauthUri).toContain(secret)
	})

	it("turns two-factor on with a valid code, signs out other sessions and issues recovery codes", async () => {
		mocked.user.findUnique.mockResolvedValue({
			id: "u1",
			totpPendingSecret: sealSecret(SECRET),
		} as never)

		const codes = await completeEnrollment("u1", codeAt(NOW), NOW)

		expect(codes).toHaveLength(10)
		expect(new Set(codes).size).toBe(10)
		expect(mocked.user.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					totpPendingSecret: null,
					tokenVersion: { increment: 1 },
				}),
			})
		)
		expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
			expect.objectContaining({ action: "user.mfa_enabled" })
		)
	})

	it("refuses a wrong confirmation code", async () => {
		mocked.user.findUnique.mockResolvedValue({
			id: "u1",
			totpPendingSecret: sealSecret(SECRET),
		} as never)

		await expect(completeEnrollment("u1", "000000", NOW)).rejects.toThrow(/did not match/)
	})
})

describe("verifySecondFactor", () => {
	const enrolled = (overrides: Record<string, unknown> = {}) => ({
		id: "u1",
		totpSecret: sealSecret(SECRET),
		totpLastStep: null,
		...overrides,
	})

	it("accepts the current authenticator code", async () => {
		mocked.user.findUnique.mockResolvedValue(enrolled() as never)

		expect(await verifySecondFactor("u1", { code: codeAt(NOW) }, NOW)).toBe("totp")
	})

	it("refuses to replay a code that was already used", async () => {
		mocked.user.findUnique.mockResolvedValue(enrolled({ totpLastStep: totpStepAt(NOW) }) as never)

		expect(await verifySecondFactor("u1", { code: codeAt(NOW) }, NOW)).toBeNull()
	})

	it("loses a race to use the same code twice at once", async () => {
		mocked.user.findUnique.mockResolvedValue(enrolled() as never)
		mocked.user.updateMany.mockResolvedValue({ count: 0 } as never)

		expect(await verifySecondFactor("u1", { code: codeAt(NOW) }, NOW)).toBeNull()
	})

	it("accepts each recovery code once and audits its use", async () => {
		mocked.user.findUnique.mockResolvedValue(enrolled() as never)
		mocked.mfaRecoveryCode.updateMany.mockResolvedValueOnce({ count: 1 } as never)

		expect(await verifySecondFactor("u1", { recoveryCode: "abcde-fghij" }, NOW)).toBe("recovery_code")
		expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
			expect.objectContaining({ action: "user.mfa_recovery_code_used" })
		)

		mocked.mfaRecoveryCode.updateMany.mockResolvedValueOnce({ count: 0 } as never)
		expect(await verifySecondFactor("u1", { recoveryCode: "abcde-fghij" }, NOW)).toBeNull()
	})

	it("fails closed for an account without two-factor", async () => {
		mocked.user.findUnique.mockResolvedValue({ id: "u1", totpSecret: null } as never)

		expect(await verifySecondFactor("u1", { code: "123456" }, NOW)).toBeNull()
	})
})

describe("disableMfa", () => {
	it("cannot be switched off when policy requires it", async () => {
		mocked.user.findUnique.mockResolvedValue({
			id: "u1",
			role: "ADMIN",
			totpEnabledAt: new Date(),
			totpSecret: sealSecret(SECRET),
		} as never)

		await expect(disableMfa("u1", { code: codeAt(Date.now()) })).rejects.toThrow(/required/)
	})
})
