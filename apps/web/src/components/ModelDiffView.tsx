"use client"

import {
	Component,
	ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { Canvas, ThreeEvent, useLoader, useThree } from "@react-three/fiber"
import { Html, OrbitControls } from "@react-three/drei"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { configureGltfCompression } from "@/lib/gltf-decoders"
import { formatLength } from "@/lib/model-inspection"
import {
	DEFAULT_TOLERANCE_SHARE,
	DeviationField,
	LARGE_CHANGE_CSS,
	SMALL_CHANGE_CSS,
	UNCHANGED_CSS,
	boundsDiagonal,
	deviationColors,
	faceDeviation,
	measureDeviation,
	summariseDeviation,
	worldSpaceGeometry,
} from "@/lib/model-diff"
import { mediaUrl } from "@/lib/utils"
import { ImageVersion, Vec3 } from "@/types"

const COMPRESSION_MODULES = { DRACOLoader, KTX2Loader, MeshoptDecoder }
const VIEW_SIZE = 4
const MAX_TOLERANCE_SHARE = 0.05
const TOLERANCE_STEPS = 500
const PERCENT = 100

interface ModelDiffViewProps {
	before: ImageVersion
	after: ImageVersion
}

interface Probe {
	position: Vec3
	deviation: number
}

const viewableUrl = (version: ImageVersion) => mediaUrl(version.proxyUrl || version.url)

function DiffScene({
	beforeUrl,
	afterUrl,
	tolerance,
	showGhost,
	onDiagonal,
	onField,
	onProgress,
	onFailure,
}: {
	beforeUrl: string
	afterUrl: string
	tolerance: number | null
	showGhost: boolean
	onDiagonal: (diagonal: number) => void
	onField: (field: DeviationField | null) => void
	onProgress: (fraction: number) => void
	onFailure: () => void
}) {
	const renderer = useThree((state) => state.gl)
	const configure = (loader: GLTFLoader) =>
		configureGltfCompression(loader, COMPRESSION_MODULES, renderer)
	const beforeGltf = useLoader(GLTFLoader, beforeUrl, configure)
	const afterGltf = useLoader(GLTFLoader, afterUrl, configure)
	const [field, setField] = useState<DeviationField | null>(null)
	const [probe, setProbe] = useState<Probe | null>(null)

	const geometries = useMemo(() => {
		const reference = worldSpaceGeometry(beforeGltf.scene)
		const candidate = worldSpaceGeometry(afterGltf.scene)
		const union = new THREE.Box3()
			.union(reference.boundingBox ?? new THREE.Box3())
			.union(candidate.boundingBox ?? new THREE.Box3())
		const center = union.getCenter(new THREE.Vector3())
		const size = union.getSize(new THREE.Vector3())
		const scale = VIEW_SIZE / (Math.max(size.x, size.y, size.z) || 1)
		return { reference, candidate, center, scale, diagonal: boundsDiagonal(reference, candidate) }
	}, [beforeGltf, afterGltf])

	useEffect(
		() => () => {
			geometries.reference.dispose()
			geometries.candidate.dispose()
		},
		[geometries]
	)

	useEffect(() => onDiagonal(geometries.diagonal), [geometries, onDiagonal])

	useEffect(() => {
		let cancelled = false
		setField(null)
		onField(null)
		measureDeviation(geometries.reference, geometries.candidate, {
			onProgress,
			isCancelled: () => cancelled,
		})
			.then((result) => {
				if (cancelled || !result) return
				setField(result)
				onField(result)
			})
			.catch(() => {
				if (!cancelled) onFailure()
			})
		return () => {
			cancelled = true
		}
	}, [geometries, onField, onFailure, onProgress])

	useEffect(() => {
		if (!field || tolerance === null) return
		const colors = deviationColors(field, tolerance)
		const existing = geometries.candidate.getAttribute("color") as THREE.BufferAttribute | undefined
		if (existing && existing.array.length === colors.length) {
			;(existing.array as Float32Array).set(colors)
			existing.needsUpdate = true
			return
		}
		geometries.candidate.setAttribute("color", new THREE.BufferAttribute(colors, 3))
	}, [field, geometries, tolerance])

	const handleClick = (event: ThreeEvent<MouseEvent>) => {
		if (!field || !event.face || event.delta > 4) return
		event.stopPropagation()
		setProbe({
			position: event.object.worldToLocal(event.point.clone()).toArray() as Vec3,
			deviation: faceDeviation(field, [event.face.a, event.face.b, event.face.c]),
		})
	}

	const { center, scale } = geometries
	return (
		<group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}>
			<mesh geometry={geometries.candidate} onClick={handleClick}>
				<meshStandardMaterial
					key={field ? "heatmap" : "plain"}
					vertexColors={!!field}
					color={field ? "#ffffff" : "#9aa3b2"}
					roughness={0.7}
					metalness={0}
					side={THREE.DoubleSide}
				/>
			</mesh>
			{showGhost && (
				<mesh geometry={geometries.reference}>
					<meshBasicMaterial color="#8a8a93" wireframe transparent opacity={0.18} />
				</mesh>
			)}
			{probe && (
				<Html position={probe.position} center zIndexRange={[40, 0]}>
					<span className="whitespace-nowrap rounded-md border border-border/60 bg-background/95 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground shadow-sm">
						{formatLength(probe.deviation)} units from the earlier version
					</span>
				</Html>
			)}
		</group>
	)
}

class DiffErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false }

	static getDerivedStateFromError() {
		return { failed: true }
	}

	render() {
		if (this.state.failed) {
			return (
				<div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
					These two models could not be compared. One of them may not have a viewable GLB.
				</div>
			)
		}
		return this.props.children
	}
}

export function ModelDiffView({ before, after }: ModelDiffViewProps) {
	const [diagonal, setDiagonal] = useState<number | null>(null)
	const [field, setField] = useState<DeviationField | null>(null)
	const [progress, setProgress] = useState(0)
	const [toleranceStep, setToleranceStep] = useState(
		Math.round((DEFAULT_TOLERANCE_SHARE / MAX_TOLERANCE_SHARE) * TOLERANCE_STEPS)
	)
	const [showGhost, setShowGhost] = useState(false)
	const [failed, setFailed] = useState(false)
	const progressRef = useRef(0)
	const handleFailure = useCallback(() => setFailed(true), [])

	const tolerance =
		diagonal === null ? null : (toleranceStep / TOLERANCE_STEPS) * MAX_TOLERANCE_SHARE * diagonal
	const summary = field && tolerance !== null ? summariseDeviation(field, tolerance) : null

	const handleProgress = useMemo(
		() => (fraction: number) => {
			const rounded = Math.round(fraction * PERCENT)
			if (rounded === progressRef.current) return
			progressRef.current = rounded
			setProgress(rounded)
		},
		[]
	)

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="relative min-h-0 flex-1 touch-none" role="application" aria-label={`3D comparison: ${after.versionName} coloured by how far it moved from ${before.versionName}. Drag to orbit.`}>
				<DiffErrorBoundary>
					<Canvas camera={{ position: [4.2, 3, 6.4], fov: 45 }} dpr={[1, 2]}>
						<ambientLight intensity={0.55} />
						<directionalLight position={[5, 8, 5]} intensity={1.1} />
						<directionalLight position={[-5, -3, -5]} intensity={0.35} />
						<Suspense
							fallback={
								<Html center>
									<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading both models" />
								</Html>
							}
						>
							<DiffScene
								key={`${before.id}:${after.id}`}
								beforeUrl={viewableUrl(before)}
								afterUrl={viewableUrl(after)}
								tolerance={tolerance}
								showGhost={showGhost}
								onDiagonal={setDiagonal}
								onField={setField}
								onProgress={handleProgress}
								onFailure={handleFailure}
							/>
						</Suspense>
						<OrbitControls makeDefault enableDamping />
					</Canvas>
				</DiffErrorBoundary>
				{failed && (
					<p role="alert" className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-destructive/20 bg-background/95 px-3 py-1 text-xs text-destructive shadow-sm">
						These models could not be measured against each other.
					</p>
				)}
				{!field && !failed && (
					<p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-muted-foreground shadow-sm" aria-live="polite">
						Measuring how {after.versionName} differs from {before.versionName}… {progress}%
					</p>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 bg-card px-3 py-2 text-xs">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Unchanged</span>
					<span
						aria-hidden="true"
						className="h-2.5 w-28 rounded-full"
						style={{
							background: `linear-gradient(to right, ${UNCHANGED_CSS} 0 18%, ${SMALL_CHANGE_CSS} 18%, ${LARGE_CHANGE_CSS})`,
						}}
					/>
					<span className="text-muted-foreground">
						Moved {summary ? `up to ${formatLength(summary.max)}` : ""}
					</span>
				</div>
				<label className="flex items-center gap-2">
					<span className="text-muted-foreground">Ignore under</span>
					<input
						type="range"
						min={0}
						max={TOLERANCE_STEPS}
						value={toleranceStep}
						onChange={(event) => setToleranceStep(Number(event.target.value))}
						aria-label="Ignore deviations smaller than"
						className="w-28 accent-primary"
					/>
					<span className="tabular-nums">{tolerance === null ? "…" : `${formatLength(tolerance)} units`}</span>
				</label>
				<Button
					size="sm"
					variant={showGhost ? "default" : "outline"}
					className="h-7 text-xs"
					onClick={() => setShowGhost((value) => !value)}
					aria-pressed={showGhost}
				>
					Show {before.versionName} as wireframe
				</Button>
				<span className="ml-auto tabular-nums text-muted-foreground" aria-live="polite">
					{summary
						? summary.changedShare === 0
							? "No geometry moved beyond the tolerance"
							: `${(summary.changedShare * PERCENT).toFixed(1)}% of ${after.versionName}'s surface moved · tap the model to measure a spot`
						: ""}
				</span>
			</div>
		</div>
	)
}
