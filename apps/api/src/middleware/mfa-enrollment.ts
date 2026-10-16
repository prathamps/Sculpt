import { Request } from "express"
import { everyoneMfaRequired, hasMfa } from "../modules/auth/mfa.service"
import { AuthenticatedUser } from "../types"

const PATHS_OPEN_BEFORE_ENROLLMENT = [
	/^\/api\/users\/me\/mfa(\/|$)/,
	/^\/api\/users\/(me|profile)$/,
	/^\/api\/auth\/logout$/,
]

export const MFA_ENROLLMENT_REQUIRED = "MFA_ENROLLMENT_REQUIRED"

export const mustEnrollBeforeContinuing = (
	req: Pick<Request, "method" | "originalUrl">,
	user: Pick<AuthenticatedUser, "totpEnabledAt">
): boolean => {
	if (!everyoneMfaRequired() || hasMfa(user)) return false
	const path = req.originalUrl.split("?")[0] ?? ""
	return !PATHS_OPEN_BEFORE_ENROLLMENT.some((pattern) => pattern.test(path))
}
