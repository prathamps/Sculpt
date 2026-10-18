import { z } from "zod"
import { SCOPES } from "./scopes"

const MAX_REQUEST_HANDLE_LENGTH = 8000
const MAX_TOKEN_NAME_LENGTH = 80
const MAX_TOKEN_LIFETIME_DAYS = 365
export const DEFAULT_TOKEN_LIFETIME_DAYS = 90
const MAX_PASSWORD_LENGTH = 200

const requestHandle = z.string().min(1).max(MAX_REQUEST_HANDLE_LENGTH)

export const consentDetailsSchema = z.object({
	request: requestHandle,
})

export const consentDecisionSchema = z.object({
	request: requestHandle,
	approved: z.boolean(),
	scopes: z.array(z.enum(SCOPES)).max(SCOPES.length).optional(),
})

export const createPersonalTokenSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Give the token a name so you can recognise it later")
		.max(MAX_TOKEN_NAME_LENGTH),
	scopes: z.array(z.enum(SCOPES)).min(1, "Choose at least one permission").max(SCOPES.length),
	expiresInDays: z
		.number()
		.int()
		.positive()
		.max(MAX_TOKEN_LIFETIME_DAYS, `Tokens can last at most ${MAX_TOKEN_LIFETIME_DAYS} days`)
		.default(DEFAULT_TOKEN_LIFETIME_DAYS),
	password: z.string().min(1).max(MAX_PASSWORD_LENGTH).optional(),
	code: z.string().trim().regex(/^d{6}$/, "Enter the 6-digit code.").optional(),
	recoveryCode: z.string().trim().min(1).max(64).optional(),
})

export const updateClientSchema = z
	.object({
		disabled: z.boolean().optional(),
		verified: z.boolean().optional(),
	})
	.refine(
		(update) => update.disabled !== undefined || update.verified !== undefined,
		"Say whether to disable or verify the app."
	)
