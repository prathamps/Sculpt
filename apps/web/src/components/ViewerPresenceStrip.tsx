"use client"

import { UserAvatar } from "@/components/UserAvatar"
import { ViewingPerson } from "@/lib/viewer-overlays"

const VISIBLE_VIEWERS = 5

export function ViewerPresenceStrip({ viewers }: { viewers: ViewingPerson[] }) {
	if (viewers.length === 0) return null

	return (
		<div
			className="flex items-center -space-x-2"
			aria-label={`${viewers.length} other ${
				viewers.length === 1 ? "person is" : "people are"
			} viewing this version`}
		>
			{viewers.slice(0, VISIBLE_VIEWERS).map((viewer, index) => (
				<span key={`${viewer.name}-${index}`} title={`${viewer.name} is viewing`}>
					<UserAvatar
						className="h-6 w-6 border-2 border-background"
						fallbackClassName="text-[10px]"
						name={viewer.name}
						avatarUrl={viewer.avatarUrl}
					/>
				</span>
			))}
			{viewers.length > VISIBLE_VIEWERS && (
				<div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px]">
					+{viewers.length - VISIBLE_VIEWERS}
				</div>
			)}
		</div>
	)
}
