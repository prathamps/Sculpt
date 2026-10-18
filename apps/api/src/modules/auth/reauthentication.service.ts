import bcrypt from "bcrypt"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, ValidationError } from "../../lib/errors"
import { hasMfa, requireSecondFactor } from "./mfa.service"

export const RECENT_SIGN_IN_MS = 15 * 60000

export interface IdentityProof {
	password?: string
	code?: string
	recoveryCode?: string
}

export class ReauthenticationRequiredError extends ForbiddenError {
	readonly code = "reauthentication_required"

	constructor() {
		super("Sign in again to confirm it's you, then try once more.")
	}
}

export const signedInRecently = (
	sessionStartedAt: number | undefined,
	now = Date.now()
): boolean => sessionStartedAt !== undefined && now - sessionStartedAt < RECENT_SIGN_IN_MS

export const confirmIdentity = async (
	userId: string,
	proof: IdentityProof,
	sessionStartedAt: number | undefined,
	now = Date.now()
): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: { password: false },
	})
	if (!user) throw new ForbiddenError("Account not found.")

	if (user.password) {
		if (!proof.password) throw new ValidationError("Confirm your password to continue.")
		if (!(await bcrypt.compare(proof.password, user.password))) {
			throw new ForbiddenError("That password is not correct.")
		}
		return
	}
	if (hasMfa(user)) {
		if (!proof.code && !proof.recoveryCode) {
			throw new ValidationError("Enter a code from your authenticator app to continue.")
		}
		await requireSecondFactor(userId, proof)
		return
	}
	if (!signedInRecently(sessionStartedAt, now)) throw new ReauthenticationRequiredError()
}
