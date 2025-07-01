"use client"

import { useState, useEffect } from "react"

/**
 * Custom hook that returns a boolean indicating whether the specified media query matches.
 * @param query The media query to match
 * @returns Boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false)

	useEffect(() => {
		// Safety check for SSR
		if (typeof window === "undefined") return

		// Initialize with the current match state
		const media = window.matchMedia(query)
		setMatches(media.matches)

		// Create handler function
		const listener = (event: MediaQueryListEvent) => {
			setMatches(event.matches)
		}

		// Add the listener
		media.addEventListener("change", listener)

		// Clean up
		return () => {
			media.removeEventListener("change", listener)
		}
	}, [query])

	return matches
}
