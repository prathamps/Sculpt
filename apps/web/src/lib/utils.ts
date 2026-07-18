import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow } from "date-fns"
import type { ProjectRole } from "@/types"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

const ROLE_RANK: Record<ProjectRole, number> = {
	VIEWER: 0,
	MEMBER: 1,
	EDITOR: 2,
	OWNER: 3,
}

/** True when `role` is at least `minimum` in the capability hierarchy. */
export function roleAtLeast(
	role: ProjectRole | null | undefined,
	minimum: ProjectRole
): boolean {
	if (!role) return false
	return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

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
 * True when a key event's target is a form control or editable region, so
 * global keyboard shortcuts must not fire.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null
	if (!el || !el.tagName) return false
	const tag = el.tagName
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		tag === "BUTTON" ||
		el.isContentEditable ||
		el.getAttribute("role") === "slider"
	)
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
