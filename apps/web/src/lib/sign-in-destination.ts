const REMEMBERED_DESTINATION_KEY = "sculpt:destination-after-sign-in"
const DEFAULT_DESTINATION = "/dashboard"
const RESOLUTION_ORIGIN = "https://sculpt.invalid"
const CHARACTERS_BROWSERS_REINTERPRET = /[\\\u0000-\u001f\u007f]/

export const safeDestination = (destination?: string | null): string => {
	if (!destination || !destination.startsWith("/")) return DEFAULT_DESTINATION
	if (CHARACTERS_BROWSERS_REINTERPRET.test(destination)) return DEFAULT_DESTINATION
	try {
		const resolved = new URL(destination, RESOLUTION_ORIGIN)
		if (resolved.origin !== RESOLUTION_ORIGIN) return DEFAULT_DESTINATION
		return `${resolved.pathname}${resolved.search}${resolved.hash}`
	} catch {
		return DEFAULT_DESTINATION
	}
}

export const requestedDestination = (search: string): string | null =>
	new URLSearchParams(search).get("next")

export const withDestination = (path: string, destination: string | null): string =>
	destination ? `${path}?next=${encodeURIComponent(destination)}` : path

export const rememberDestination = (destination: string | null): void => {
	try {
		if (destination) window.sessionStorage.setItem(REMEMBERED_DESTINATION_KEY, destination)
		else window.sessionStorage.removeItem(REMEMBERED_DESTINATION_KEY)
	} catch {
		return
	}
}

export const takeRememberedDestination = (): string | null => {
	try {
		const destination = window.sessionStorage.getItem(REMEMBERED_DESTINATION_KEY)
		window.sessionStorage.removeItem(REMEMBERED_DESTINATION_KEY)
		return destination
	} catch {
		return null
	}
}
