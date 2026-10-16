import { z } from "zod"

export const MINIMUM_PASSWORD_LENGTH = 8
const MAXIMUM_PASSWORD_LENGTH = 200

export const passwordSchema = z
	.string()
	.min(
		MINIMUM_PASSWORD_LENGTH,
		`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long.`
	)
	.max(MAXIMUM_PASSWORD_LENGTH)

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.email("Enter a valid email address.")
	.max(255)

export const registerSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
	name: z.string().trim().min(1).max(120).optional(),
})

export const loginSchema = z.object({
	email: emailSchema,
	password: z.string().min(1, "Password is required."),
})

export const adminLoginSchema = loginSchema

const totpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.")
const recoveryCode = z.string().trim().min(8).max(32)

export const secondFactorSchema = z
	.object({
		code: totpCode.optional(),
		recoveryCode: recoveryCode.optional(),
	})
	.refine(
		(factor) => !!factor.code || !!factor.recoveryCode,
		"Enter a code from your authenticator app or a recovery code."
	)

export const enableMfaSchema = z.object({ code: totpCode })

export const disableMfaSchema = z
	.object({
		password: z.string().min(1).max(200).optional(),
		code: totpCode.optional(),
		recoveryCode: recoveryCode.optional(),
	})
	.refine(
		(factor) => !!factor.code || !!factor.recoveryCode,
		"Enter a code from your authenticator app or a recovery code."
	)

export const requestPasswordResetSchema = z.object({
	email: emailSchema,
})

export const completePasswordResetSchema = z.object({
	token: z.string().min(1, "Reset token is required."),
	password: passwordSchema,
})

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1, "Current password is required."),
	newPassword: passwordSchema,
})

export const updateProfileSchema = z.object({
	name: z.string().trim().min(1, "Name cannot be empty").max(120).optional(),
	avatarUrl: z.string().trim().url().max(2000).nullish(),
})
