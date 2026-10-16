"use client"

import { useMemo } from "react"

const TILE_COUNT = 24

export const watermarkLabel = (email: string, at: Date): string =>
	`${email} · ${at.toISOString().slice(0, 10)}`

export function ViewerWatermark({ email }: { email: string }) {
	const label = useMemo(() => watermarkLabel(email, new Date()), [email])

	return (
		<div
			aria-hidden="true"
			data-testid="viewer-watermark"
			className="pointer-events-none absolute inset-0 z-20 grid select-none grid-cols-3 content-around overflow-hidden"
		>
			{Array.from({ length: TILE_COUNT }, (_, index) => (
				<span
					key={index}
					className="-rotate-[24deg] whitespace-nowrap text-center text-sm font-medium text-foreground/20"
				>
					{label}
				</span>
			))}
		</div>
	)
}
