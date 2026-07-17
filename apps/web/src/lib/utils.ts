import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow } from "date-fns"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

/**
 * Resolve a stored media URL: absolute URLs (e.g. S3) pass through,
 * relative ones are served by the API.
 */
export function mediaUrl(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://")) return url
	return `${API_URL}/${url}`
}

/**
 * Format bytes to a human-readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return "0 Bytes"

	const k = 1024
	const dm = decimals < 0 ? 0 : decimals
	const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]

	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}

/**
 * Format a date to a relative time string
 */
export function formatDate(dateString: string): string {
	const date = new Date(dateString)
	return formatDistanceToNow(date, { addSuffix: true })
}

/**
 * Format a number of seconds as m:ss (or m:ss.d for sub-second precision)
 */
export function formatVideoTime(seconds: number, withDecimals = false): string {
	if (!isFinite(seconds) || seconds < 0) seconds = 0
	const mins = Math.floor(seconds / 60)
	const secs = seconds - mins * 60
	if (withDecimals) {
		return `${mins}:${secs.toFixed(1).padStart(4, "0")}`
	}
	return `${mins}:${Math.floor(secs).toString().padStart(2, "0")}`
}
