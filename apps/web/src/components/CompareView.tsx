"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Link2, Link2Off, Loader2 } from "lucide-react"
import { ComparePane } from "./ComparePane"
import { ImageDiffMode, ImageDiffView } from "./ImageDiffView"
import { Button } from "./ui/button"
import { ImageVersion } from "@/types"
import { createCameraLink, createPlaybackLink } from "@/lib/camera-link"
import { cn } from "@/lib/utils"

const ModelDiffView = dynamic(() => import("./ModelDiffView").then((mod) => mod.ModelDiffView), {
	ssr: false,
	loading: () => (
		<div className="flex flex-1 items-center justify-center">
			<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
		</div>
	),
})

interface CompareViewProps {
	versions: ImageVersion[]
	leftVersion: ImageVersion
	rightVersion: ImageVersion
	onLeftChange: (version: ImageVersion) => void
	onRightChange: (version: ImageVersion) => void
}

type CompareMode = "side-by-side" | ImageDiffMode | "deviation"

const IMAGE_MODES: { id: CompareMode; label: string }[] = [
	{ id: "side-by-side", label: "Side by side" },
	{ id: "swipe", label: "Swipe" },
	{ id: "onion", label: "Onion skin" },
	{ id: "difference", label: "Difference" },
]

const MODEL_MODES: { id: CompareMode; label: string }[] = [
	{ id: "side-by-side", label: "Side by side" },
	{ id: "deviation", label: "What changed" },
]

export const compareModesFor = (
	left: ImageVersion,
	right: ImageVersion
): { id: CompareMode; label: string }[] => {
	if (left.mediaType === "MODEL" && right.mediaType === "MODEL") return MODEL_MODES
	const isImage = (version: ImageVersion) => (version.mediaType ?? "IMAGE") === "IMAGE"
	return isImage(left) && isImage(right) ? IMAGE_MODES : []
}

const byVersionNumber = (a: ImageVersion, b: ImageVersion) => a.versionNumber - b.versionNumber

function VersionSelect({
	label,
	value,
	versions,
	onChange,
}: {
	label: string
	value: ImageVersion
	versions: ImageVersion[]
	onChange: (version: ImageVersion) => void
}) {
	return (
		<label className="flex items-center gap-1.5 text-xs">
			<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
				{label}
			</span>
			<select
				value={value.id}
				onChange={(event) => {
					const next = versions.find((version) => version.id === event.target.value)
					if (next) onChange(next)
				}}
				aria-label={`Version ${label}`}
				className="h-7 max-w-[9rem] rounded-md border border-border bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{versions.map((version) => (
					<option key={version.id} value={version.id}>
						{version.versionName}
					</option>
				))}
			</select>
		</label>
	)
}

export function CompareView({
	versions,
	leftVersion,
	rightVersion,
	onLeftChange,
	onRightChange,
}: CompareViewProps) {
	const bothModels = leftVersion.mediaType === "MODEL" && rightVersion.mediaType === "MODEL"
	const bothVideos = leftVersion.mediaType === "VIDEO" && rightVersion.mediaType === "VIDEO"
	const [camerasLinked, setCamerasLinked] = useState(true)
	const [playbackLinked, setPlaybackLinked] = useState(true)
	const playbackLink = useMemo(
		() => (bothVideos && playbackLinked ? createPlaybackLink() : null),
		[bothVideos, playbackLinked]
	)
	const [mode, setMode] = useState<CompareMode>("side-by-side")
	const cameraLink = useMemo(
		() => (bothModels && camerasLinked ? createCameraLink() : null),
		[bothModels, camerasLinked]
	)
	const modes = compareModesFor(leftVersion, rightVersion)
	const activeMode = modes.some((option) => option.id === mode) ? mode : "side-by-side"
	const [earlier, later] = [leftVersion, rightVersion].sort(byVersionNumber) as [
		ImageVersion,
		ImageVersion,
	]

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			{(modes.length > 0 || bothVideos) && (
				<div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-card px-3 py-2">
					<div role="group" aria-label="Compare mode" className="flex flex-wrap gap-1 rounded-md bg-muted p-0.5">
						{modes.map((option) => (
							<button
								key={option.id}
								type="button"
								aria-pressed={activeMode === option.id}
								onClick={() => setMode(option.id)}
								className={cn(
									"rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2",
									activeMode === option.id
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								)}
							>
								{option.label}
							</button>
						))}
					</div>
					{activeMode === "side-by-side" && (bothModels || bothVideos) && (
						<Button
							size="sm"
							variant={(bothModels ? camerasLinked : playbackLinked) ? "default" : "outline"}
							className="ml-auto h-7 gap-1.5 text-xs pointer-coarse:h-9"
							onClick={() =>
								bothModels
									? setCamerasLinked((linked) => !linked)
									: setPlaybackLinked((linked) => !linked)
							}
							aria-pressed={bothModels ? camerasLinked : playbackLinked}
						>
							{(bothModels ? camerasLinked : playbackLinked) ? (
								<Link2 className="h-3.5 w-3.5" aria-hidden="true" />
							) : (
								<Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
							)}
							{bothModels
								? camerasLinked
									? "Cameras linked"
									: "Link cameras"
								: playbackLinked
									? "Playback synced"
									: "Sync playback"}
						</Button>
					)}
					{activeMode !== "side-by-side" && (
						<div className="ml-auto flex items-center gap-2">
							<VersionSelect label="A" value={leftVersion} versions={versions} onChange={onLeftChange} />
							<VersionSelect label="B" value={rightVersion} versions={versions} onChange={onRightChange} />
						</div>
					)}
				</div>
			)}
			{activeMode === "deviation" ? (
				<ModelDiffView key={`${earlier.id}:${later.id}`} before={earlier} after={later} />
			) : activeMode !== "side-by-side" ? (
				<ImageDiffView before={earlier} after={later} mode={activeMode} />
			) : (
				<div className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
					<ComparePane
						label="A"
						version={leftVersion}
						versions={versions}
						onVersionChange={onLeftChange}
						cameraLink={cameraLink}
						playbackLink={playbackLink}
					/>
					<div
						className="border-t border-border md:border-l md:border-t-0"
						aria-hidden="true"
					/>
					<ComparePane
						label="B"
						version={rightVersion}
						versions={versions}
						onVersionChange={onRightChange}
						cameraLink={cameraLink}
						playbackLink={playbackLink}
					/>
				</div>
			)}
		</div>
	)
}
