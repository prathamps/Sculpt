"use client"

import { useId } from "react"
import {
	Box,
	Camera,
	Check,
	Info,
	Pause,
	Play,
	Ruler,
	Scan,
	Scissors,
	FlipHorizontal2,
	X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
	ModelStats,
	SectionAxis,
	VIEW_PRESETS,
	ViewPreset,
	formatCount,
	formatLength,
} from "@/lib/model-inspection"

export type RenderMode = "shaded" | "clay" | "wireframe" | "normals"
export type Lighting = "studio" | "flat"
export type ModelTool = "pin" | "measure"

export const RENDER_MODES: { id: RenderMode; label: string }[] = [
	{ id: "shaded", label: "Materials" },
	{ id: "clay", label: "Clay" },
	{ id: "wireframe", label: "Wireframe" },
	{ id: "normals", label: "Normals" },
]

export const LIGHTINGS: Lighting[] = ["studio", "flat"]

const LIGHTING_LABELS: Record<Lighting, string> = {
	studio: "Studio lighting",
	flat: "Simple lighting",
}

export interface SectionState {
	enabled: boolean
	axis: SectionAxis
	fraction: number
	flipped: boolean
}

const SECTION_AXES: SectionAxis[] = ["x", "y", "z"]
const SECTION_SLIDER_STEPS = 200

interface ModelViewerToolbarProps {
	stats: ModelStats | null
	clipNames: string[]
	renderMode: RenderMode
	onRenderModeChange: (mode: RenderMode) => void
	lighting: Lighting
	onLightingChange: (lighting: Lighting) => void
	showGrid: boolean
	onToggleGrid: () => void
	autoRotate: boolean
	onToggleAutoRotate: () => void
	section: SectionState
	onSectionChange: (section: SectionState) => void
	tool: ModelTool
	onToolChange: (tool: ModelTool) => void
	showInfo: boolean
	onToggleInfo: () => void
	activeClip: number
	onActiveClipChange: (index: number) => void
	isAnimating: boolean
	onToggleAnimating: () => void
	onPreset: (preset: ViewPreset) => void
	onSaveImage?: () => void
}

const toolButton = "h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"

const CheckSlot = ({ on }: { on: boolean }) => (
	<Check className={cn("h-3.5 w-3.5", !on && "invisible")} aria-hidden="true" />
)

export function ModelViewerToolbar({
	stats,
	clipNames,
	renderMode,
	onRenderModeChange,
	lighting,
	onLightingChange,
	showGrid,
	onToggleGrid,
	autoRotate,
	onToggleAutoRotate,
	section,
	onSectionChange,
	tool,
	onToolChange,
	showInfo,
	onToggleInfo,
	activeClip,
	onActiveClipChange,
	isAnimating,
	onToggleAnimating,
	onPreset,
	onSaveImage,
}: ModelViewerToolbarProps) {
	const hasAnimations = clipNames.length > 0
	const clipSelectId = useId()

	return (
		<>
			<div
				role="toolbar"
				aria-label="3D view tools"
				aria-orientation="vertical"
				className="absolute right-2 top-2 z-10 flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/85 p-1 shadow-sm backdrop-blur-sm"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost" className={toolButton} aria-label="Camera views">
							<Scan className="h-4 w-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="left" align="start" className="w-44">
						<DropdownMenuLabel className="text-xs">View</DropdownMenuLabel>
						{VIEW_PRESETS.map((preset) => (
							<DropdownMenuItem
								key={preset.id}
								className="text-xs"
								onClick={() => onPreset(preset.id)}
							>
								{preset.id === "iso" ? "Fit model" : preset.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost" className={toolButton} aria-label="Display options">
							<Box className="h-4 w-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="left" align="start" className="w-48">
						<DropdownMenuLabel className="text-xs">Shading</DropdownMenuLabel>
						{RENDER_MODES.map((mode) => (
							<DropdownMenuItem
								key={mode.id}
								className="gap-2 text-xs"
								role="menuitemradio"
								aria-checked={mode.id === renderMode}
								onClick={() => onRenderModeChange(mode.id)}
							>
								<CheckSlot on={mode.id === renderMode} />
								{mode.label}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						{LIGHTINGS.map((option) => (
							<DropdownMenuItem
								key={option}
								className="gap-2 text-xs"
								role="menuitemradio"
								aria-checked={option === lighting}
								onClick={() => onLightingChange(option)}
							>
								<CheckSlot on={option === lighting} />
								{LIGHTING_LABELS[option]}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="gap-2 text-xs"
							role="menuitemcheckbox"
							aria-checked={showGrid}
							onClick={onToggleGrid}
						>
							<CheckSlot on={showGrid} />
							Ground grid
						</DropdownMenuItem>
						<DropdownMenuItem
							className="gap-2 text-xs"
							role="menuitemcheckbox"
							aria-checked={autoRotate}
							onClick={onToggleAutoRotate}
						>
							<CheckSlot on={autoRotate} />
							Turntable
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					size="icon"
					variant={section.enabled ? "default" : "ghost"}
					className={toolButton}
					aria-label="Section cut"
					aria-pressed={section.enabled}
					onClick={() => onSectionChange({ ...section, enabled: !section.enabled })}
				>
					<Scissors className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon"
					variant={tool === "measure" ? "default" : "ghost"}
					className={toolButton}
					aria-label="Measure distance"
					aria-pressed={tool === "measure"}
					onClick={() => onToolChange(tool === "measure" ? "pin" : "measure")}
				>
					<Ruler className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon"
					variant={showInfo ? "default" : "ghost"}
					className={toolButton}
					aria-label="Model details"
					aria-pressed={showInfo}
					onClick={onToggleInfo}
				>
					<Info className="h-4 w-4" aria-hidden="true" />
				</Button>
				{hasAnimations && (
					<Button
						size="icon"
						variant={isAnimating ? "default" : "ghost"}
						className={toolButton}
						aria-label={isAnimating ? "Pause animation" : "Play animation"}
						aria-pressed={isAnimating}
						onClick={onToggleAnimating}
					>
						{isAnimating ? (
							<Pause className="h-4 w-4" aria-hidden="true" />
						) : (
							<Play className="h-4 w-4" aria-hidden="true" />
						)}
					</Button>
				)}
				{onSaveImage && (
					<Button
						size="icon"
						variant="ghost"
						className={toolButton}
						aria-label="Save this view as PNG"
						onClick={onSaveImage}
					>
						<Camera className="h-4 w-4" aria-hidden="true" />
					</Button>
				)}
			</div>

			<div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-4.5rem)] flex-col gap-2">
				{showInfo && stats && (
					<section
						aria-label="Model details"
						className="pointer-events-auto w-56 max-w-full rounded-lg border border-border/60 bg-background/90 p-3 text-xs shadow-sm backdrop-blur-sm"
					>
						<div className="mb-2 flex items-center justify-between">
							<h3 className="font-medium">Model details</h3>
							<button
								type="button"
								onClick={onToggleInfo}
								className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Close model details"
							>
								<X className="h-3.5 w-3.5" aria-hidden="true" />
							</button>
						</div>
						<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
							<dt className="text-muted-foreground">Triangles</dt>
							<dd className="text-right tabular-nums">{formatCount(stats.triangles)}</dd>
							<dt className="text-muted-foreground">Vertices</dt>
							<dd className="text-right tabular-nums">{formatCount(stats.vertices)}</dd>
							<dt className="text-muted-foreground">Meshes</dt>
							<dd className="text-right tabular-nums">{stats.meshes}</dd>
							<dt className="text-muted-foreground">Materials</dt>
							<dd className="text-right tabular-nums">{stats.materials}</dd>
							<dt className="text-muted-foreground">Textures</dt>
							<dd className="text-right tabular-nums">{stats.textures}</dd>
							<dt className="text-muted-foreground">Animations</dt>
							<dd className="text-right tabular-nums">{stats.animations}</dd>
							<dt className="text-muted-foreground">Size</dt>
							<dd className="text-right tabular-nums">
								{stats.size.map(formatLength).join(" × ")}
							</dd>
						</dl>
						<p className="mt-2 text-[11px] text-muted-foreground">
							Sizes are in the model&apos;s own units — metres for glTF.
						</p>
					</section>
				)}

				{section.enabled && (
					<section
						aria-label="Section cut"
						className="pointer-events-auto w-56 max-w-full rounded-lg border border-border/60 bg-background/90 p-3 text-xs shadow-sm backdrop-blur-sm"
					>
						<div className="mb-2 flex items-center gap-1">
							<span className="mr-auto font-medium">Section</span>
							{SECTION_AXES.map((axis) => (
								<Button
									key={axis}
									size="sm"
									variant={section.axis === axis ? "default" : "outline"}
									className="h-6 w-7 px-0 text-[11px] uppercase pointer-coarse:h-8 pointer-coarse:w-9"
									aria-pressed={section.axis === axis}
									aria-label={`Cut across the ${axis.toUpperCase()} axis`}
									onClick={() => onSectionChange({ ...section, axis, fraction: 0 })}
								>
									{axis}
								</Button>
							))}
							<Button
								size="icon"
								variant={section.flipped ? "default" : "outline"}
								className="h-6 w-7 pointer-coarse:h-8 pointer-coarse:w-9"
								aria-pressed={section.flipped}
								aria-label="Keep the other side of the cut"
								onClick={() => onSectionChange({ ...section, flipped: !section.flipped })}
							>
								<FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
							</Button>
						</div>
						<input
							type="range"
							min={-SECTION_SLIDER_STEPS / 2}
							max={SECTION_SLIDER_STEPS / 2}
							value={Math.round((section.fraction * SECTION_SLIDER_STEPS) / 2)}
							onChange={(event) =>
								onSectionChange({
									...section,
									fraction: (Number(event.target.value) * 2) / SECTION_SLIDER_STEPS,
								})
							}
							aria-label="Section position"
							className="w-full accent-primary"
						/>
					</section>
				)}

				{hasAnimations && (isAnimating || clipNames.length > 1) && (
					<section
						aria-label="Animation"
						className="pointer-events-auto w-56 max-w-full rounded-lg border border-border/60 bg-background/90 p-3 text-xs shadow-sm backdrop-blur-sm"
					>
						<label htmlFor={clipSelectId} className="mb-1 block font-medium">
							Animation
						</label>
						<select
							id={clipSelectId}
							value={activeClip}
							onChange={(event) => onActiveClipChange(Number(event.target.value))}
							className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{clipNames.map((name, index) => (
								<option key={`${name}-${index}`} value={index}>
									{name || `Clip ${index + 1}`}
								</option>
							))}
						</select>
					</section>
				)}
			</div>
		</>
	)
}
