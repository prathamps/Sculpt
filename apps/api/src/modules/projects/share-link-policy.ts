import { ValidationError } from "../../lib/errors"

const DEFAULT_EXPIRY_DAYS = 7

const positiveDaysFromEnv = (variable: string): number | null => {
	const days = Number(process.env[variable])
	return Number.isFinite(days) && days > 0 ? days : null
}

export const defaultShareLinkExpiryDays = (): number =>
	positiveDaysFromEnv("SHARE_LINK_DEFAULT_EXPIRY_DAYS") ?? DEFAULT_EXPIRY_DAYS

export const maximumShareLinkDays = (): number | null =>
	positiveDaysFromEnv("SHARE_LINK_MAX_DAYS")

export const shareLinkExpiryDays = (
	requested: number | null | undefined
): number | null => {
	const maximum = maximumShareLinkDays()
	if (requested === undefined) {
		const fallback = defaultShareLinkExpiryDays()
		return maximum === null ? fallback : Math.min(fallback, maximum)
	}
	if (requested === null) {
		if (maximum !== null) {
			throw new ValidationError(
				`Share links on this server must expire within ${maximum} days.`
			)
		}
		return null
	}
	if (maximum !== null && requested > maximum) {
		throw new ValidationError(
			`Share links on this server must expire within ${maximum} days.`
		)
	}
	return requested
}
