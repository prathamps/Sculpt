"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn, mediaUrl } from "@/lib/utils"

const AVATAR_PALETTE = [
	"bg-sky-500/15 text-sky-700 dark:text-sky-300",
	"bg-violet-500/15 text-violet-700 dark:text-violet-300",
	"bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	"bg-amber-500/15 text-amber-700 dark:text-amber-300",
	"bg-rose-500/15 text-rose-700 dark:text-rose-300",
	"bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
]

const stableIndex = (seed: string, buckets: number): number => {
	let hash = 0
	for (let index = 0; index < seed.length; index++) {
		hash = (hash * 31 + seed.charCodeAt(index)) % 100000
	}
	return hash % buckets
}

export const initialsOf = (name?: string | null, email?: string | null): string => {
	const source = name?.trim() || email?.trim() || "?"
	const words = source.split(/[\s._-]+/).filter(Boolean)

	if (words.length >= 2) {
		return `${words[0][0]}${words[1][0]}`.toUpperCase()
	}
	return source.slice(0, 2).toUpperCase()
}

interface UserAvatarProps {
	name?: string | null
	email?: string | null
	avatarUrl?: string | null
	className?: string
	fallbackClassName?: string
}

export function UserAvatar({
	name,
	email,
	avatarUrl,
	className,
	fallbackClassName,
}: UserAvatarProps) {
	const label = name || email || "Unknown user"
	const tone = AVATAR_PALETTE[stableIndex(label, AVATAR_PALETTE.length)]

	return (
		<Avatar className={className}>
			{avatarUrl ? <AvatarImage src={mediaUrl(avatarUrl)} alt={label} /> : null}
			<AvatarFallback className={cn("font-medium", tone, fallbackClassName)}>
				{initialsOf(name, email)}
			</AvatarFallback>
		</Avatar>
	)
}
