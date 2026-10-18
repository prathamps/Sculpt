"use client"

import { useCallback, useSyncExternalStore } from "react"

const PREFERENCE_EVENT = "sculpt:viewer-preference"

const readStored = (key: string): string | null => {
	try {
		return window.localStorage.getItem(key)
	} catch {
		return null
	}
}

const writeStored = (key: string, value: string): void => {
	try {
		window.localStorage.setItem(key, value)
	} catch {
		return
	}
}

const subscribe = (onChange: () => void) => {
	window.addEventListener("storage", onChange)
	window.addEventListener(PREFERENCE_EVENT, onChange)
	return () => {
		window.removeEventListener("storage", onChange)
		window.removeEventListener(PREFERENCE_EVENT, onChange)
	}
}

export function useViewerPreference<T extends string>(
	key: string,
	allowed: readonly T[],
	fallback: T
): [T, (value: T) => void] {
	const stored = useSyncExternalStore(
		subscribe,
		() => readStored(key),
		() => null
	)
	const value = stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback

	const setValue = useCallback(
		(next: T) => {
			writeStored(key, next)
			window.dispatchEvent(new Event(PREFERENCE_EVENT))
		},
		[key]
	)

	return [value, setValue]
}
