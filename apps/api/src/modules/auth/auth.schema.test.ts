import { describe, expect, it } from "vitest"
import { disableMfaSchema, enableMfaSchema, secondFactorSchema } from "./auth.schema"

describe("two-factor request validation", () => {
	it("accepts a six-digit authenticator code", () => {
		expect(enableMfaSchema.safeParse({ code: "123456" }).success).toBe(true)
		expect(secondFactorSchema.safeParse({ code: " 042917 " }).success).toBe(true)
	})

	it("rejects codes that are not six digits", () => {
		expect(enableMfaSchema.safeParse({ code: "12345" }).success).toBe(false)
		expect(enableMfaSchema.safeParse({ code: "12345a" }).success).toBe(false)
		expect(enableMfaSchema.safeParse({ code: "dddddd" }).success).toBe(false)
	})

	it("accepts a recovery code in place of an authenticator code", () => {
		expect(secondFactorSchema.safeParse({ recoveryCode: "ABCDE-FGHIJ" }).success).toBe(true)
	})

	it("requires one of the two factors", () => {
		expect(secondFactorSchema.safeParse({}).success).toBe(false)
		expect(disableMfaSchema.safeParse({ password: "secret" }).success).toBe(false)
	})
})
