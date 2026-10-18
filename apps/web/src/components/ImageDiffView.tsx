"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, mediaUrl } from "@/lib/utils"
import { ImageDiff, diffImages } from "@/lib/image-diff"
import { ImageVersion } from "@/types"

export type ImageDiffMode = "swipe" | "onion" | "difference"

interface ImageDiffViewProps {
	before: ImageVersion
	after: ImageVersion
	mode: ImageDiffMode
}

const PERCENT = 100
const DEFAULT_SWIPE = 50
const DEFAULT_ONION = 50

const sourceOf = (version: ImageVersion) => mediaUrl(version.proxyUrl || version.url)

const loadImage = (src: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const image = new window.Image()
		image.crossOrigin = "anonymous"
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error(`Could not load ${src}`))
		image.src = src
	})

const formatShare = (fraction: number): string =>
	fraction > 0 && fraction < 0.001 ? "<0.1%" : `${(fraction * PERCENT).toFixed(1)}%`

export function ImageDiffView({ before, after, mode }: ImageDiffViewProps) {
	const [swipe, setSwipe] = useState(DEFAULT_SWIPE)
	const [onion, setOnion] = useState(DEFAULT_ONION)
	const [diff, setDiff] = useState<ImageDiff | null>(null)
	const [diffError, setDiffError] = useState(false)
	const [showRegions, setShowRegions] = useState(true)
	const beforeSrc = sourceOf(before)
	const afterSrc = sourceOf(after)
	const requestRef = useRef(0)

	useEffect(() => {
		const request = ++requestRef.current
		setDiff(null)
		setDiffError(false)
		Promise.all([loadImage(beforeSrc), loadImage(afterSrc)])
			.then(([beforeImage, afterImage]) => {
				if (request === requestRef.current) setDiff(diffImages(beforeImage, afterImage))
			})
			.catch(() => {
				if (request === requestRef.current) setDiffError(true)
			})
	}, [beforeSrc, afterSrc])

	const overlayStyle =
		mode === "swipe"
			? { clipPath: `inset(0 0 0 ${swipe}%)` }
			: mode === "onion"
				? { opacity: onion / PERCENT }
				: { mixBlendMode: "difference" as const }

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 p-3">
				<div
					className={cn(
						"relative max-h-full max-w-full rounded-sm has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
						mode === "difference" && "bg-black"
					)}
				>
					<img
						src={beforeSrc}
						alt={`${before.versionName}, the earlier version`}
						crossOrigin="anonymous"
						className="block max-h-[calc(100dvh-12rem)] max-w-full select-none object-contain"
						draggable={false}
					/>
					<img
						src={afterSrc}
						alt={`${after.versionName}, the later version`}
						crossOrigin="anonymous"
						className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
						style={overlayStyle}
						draggable={false}
					/>
					{mode === "swipe" && (
						<>
							<div
								aria-hidden="true"
								className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-[0_0_0_1px_var(--color-border)]"
								style={{ left: `${swipe}%` }}
							/>
							<input
								type="range"
								min={0}
								max={PERCENT}
								value={swipe}
								onChange={(event) => setSwipe(Number(event.target.value))}
								aria-label={`Swipe between ${before.versionName} and ${after.versionName}`}
								className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
							/>
							<span className="pointer-events-none absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold">
								{before.versionName}
							</span>
							<span className="pointer-events-none absolute right-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold">
								{after.versionName}
							</span>
						</>
					)}
					{showRegions &&
						diff?.regions.map((region, index) => (
							<div
								key={index}
								aria-hidden="true"
								className="pointer-events-none absolute rounded-sm border-2 border-primary shadow-[0_0_0_1px_var(--color-background)]"
								style={{
									left: `${region.x * PERCENT}%`,
									top: `${region.y * PERCENT}%`,
									width: `${region.width * PERCENT}%`,
									height: `${region.height * PERCENT}%`,
								}}
							/>
						))}
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-3 border-t border-border/40 bg-card px-3 py-2 text-xs">
				{mode === "onion" && (
					<label className="flex items-center gap-2">
						<span className="text-muted-foreground">{before.versionName}</span>
						<input
							type="range"
							min={0}
							max={PERCENT}
							value={onion}
							onChange={(event) => setOnion(Number(event.target.value))}
							aria-label={`Blend from ${before.versionName} to ${after.versionName}`}
							className="w-32 accent-primary sm:w-48"
						/>
						<span className="text-muted-foreground">{after.versionName}</span>
					</label>
				)}
				{mode === "difference" && (
					<span className="text-muted-foreground">
						Unchanged areas turn black; anything that changed glows.
					</span>
				)}
				<div className="ml-auto flex items-center gap-2" aria-live="polite">
					{diff ? (
						<span className="tabular-nums text-muted-foreground">
							{diff.regions.length === 0
								? "No visible changes"
								: `${diff.regions.length} changed ${diff.regions.length === 1 ? "area" : "areas"} · ${formatShare(diff.changedFraction)} of pixels`}
						</span>
					) : diffError ? (
						<span className="text-muted-foreground">Could not compare these files pixel by pixel.</span>
					) : (
						<span className="flex items-center gap-1 text-muted-foreground">
							<Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
							Finding changes…
						</span>
					)}
					{diff && diff.regions.length > 0 && (
						<Button
							size="sm"
							variant={showRegions ? "default" : "outline"}
							className="h-7 gap-1 text-xs"
							onClick={() => setShowRegions((value) => !value)}
							aria-pressed={showRegions}
						>
							<ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />
							Outline changes
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}
