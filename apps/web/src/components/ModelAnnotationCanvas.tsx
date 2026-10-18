"use client"

import {
	Component,
	MutableRefObject,
	ReactNode,
	RefObject,
	Suspense,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { clone as cloneWithSkeletons } from "three/examples/jsm/utils/SkeletonUtils.js"
import {
	Canvas,
	ThreeEvent,
	useFrame,
	useLoader,
	useThree,
} from "@react-three/fiber"
import { Html, Line, OrbitControls } from "@react-three/drei"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { configureGltfCompression } from "@/lib/gltf-decoders"
import { Loader2 } from "lucide-react"
import { ModelAnchor, Vec3 } from "@/types"
import { cn, isEditableTarget } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useViewerPreference } from "@/hooks/useViewerPreference"
import { CameraLink } from "@/lib/camera-link"
import {
	ModelStats,
	ViewPreset,
	formatLength,
	inspectModel,
	modelDistance,
	presetCamera,
	sectionPlane,
} from "@/lib/model-inspection"
import {
	LIGHTINGS,
	Lighting,
	ModelTool,
	ModelViewerToolbar,
	RenderMode,
	SectionState,
} from "./ModelViewerToolbar"

const MODEL_TARGET_SIZE = 4
const CLICK_DRAG_TOLERANCE_PX = 4
const PIN_SURFACE_OFFSET = 0.06
const CAMERA_FOV = 45
const GRID_DIVISIONS = 20
const MEASURE_COLOR = "#f59e0b"
const LIGHTING_KEY = "sculpt:model-lighting"

export interface ModelPin {
	commentId: string
	number: number
	label: string
	anchor: ModelAnchor
	selected: boolean
	badge?: string
}

export interface ModelFlyToRequest {
	camera: NonNullable<ModelAnchor["camera"]>
	nonce: number
}

interface ModelAnnotationCanvasProps {
	modelUrl: string
	canComment: boolean
	pins: ModelPin[]
	pendingPin?: ModelAnchor | null
	flyTo?: ModelFlyToRequest | null
	onPlacePin?: (anchor: ModelAnchor) => void
	onSelectComment?: (commentId: string) => void
	cameraLink?: CameraLink | null
	canExport?: boolean
	enableShortcuts?: boolean
	fileName?: string
}

type CameraGoal = { position: THREE.Vector3; target: THREE.Vector3 }

interface LoadedModel {
	stats: ModelStats
	radius: number
	halfExtents: Vec3
	scale: number
	clipNames: string[]
}

interface SurfaceHit {
	position: Vec3
	normal?: Vec3
	camera: { position: Vec3; target: Vec3 }
}

interface ViewerApi {
	flyToPreset: (preset: ViewPreset) => void
	saveImage: (fileName: string) => void
}

const pinPosition = (anchor: ModelAnchor): Vec3 => {
	if (!anchor.normal) return anchor.position
	const [x, y, z] = anchor.position
	const [nx, ny, nz] = anchor.normal
	return [
		x + nx * PIN_SURFACE_OFFSET,
		y + ny * PIN_SURFACE_OFFSET,
		z + nz * PIN_SURFACE_OFFSET,
	]
}

const COMPRESSION_MODULES = { DRACOLoader, KTX2Loader, MeshoptDecoder }

const createOverrideMaterials = (): Record<Exclude<RenderMode, "shaded">, THREE.Material> => ({
	clay: new THREE.MeshStandardMaterial({ color: 0xb9b9bd, roughness: 0.8, metalness: 0 }),
	wireframe: new THREE.MeshBasicMaterial({ color: 0x4783e8, wireframe: true }),
	normals: new THREE.MeshNormalMaterial(),
})

const useRenderMode = (root: THREE.Object3D, renderMode: RenderMode) => {
	const originals = useMemo(() => new Map<THREE.Mesh, THREE.Mesh["material"]>(), [])
	const overrides = useMemo(createOverrideMaterials, [])

	useEffect(
		() => () => Object.values(overrides).forEach((material) => material.dispose()),
		[overrides]
	)

	useEffect(() => {
		root.traverse((object) => {
			const mesh = object as THREE.Mesh
			if (!mesh.isMesh) return
			if (!originals.has(mesh)) originals.set(mesh, mesh.material)
			mesh.material =
				renderMode === "shaded" ? (originals.get(mesh) as THREE.Mesh["material"]) : overrides[renderMode]
		})
	}, [root, renderMode, originals, overrides])
}

function NormalizedModel({
	url,
	renderMode,
	activeClip,
	isAnimating,
	acceptsClicks,
	clipPlane,
	onLoaded,
	onSurfaceClick,
	controlsRef,
}: {
	url: string
	renderMode: RenderMode
	activeClip: number
	isAnimating: boolean
	acceptsClicks: boolean
	clipPlane: THREE.Plane | null
	onLoaded: (url: string, model: LoadedModel) => void
	onSurfaceClick: (hit: SurfaceHit) => void
	controlsRef: RefObject<OrbitControlsImpl | null>
}) {
	const renderer = useThree((state) => state.gl)
	const gltf = useLoader(GLTFLoader, url, (loader) =>
		configureGltfCompression(loader, COMPRESSION_MODULES, renderer)
	)

	const { group, root, loaded } = useMemo(() => {
		const root = cloneWithSkeletons(gltf.scene)
		const box = new THREE.Box3().setFromObject(root)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		const maxDimension = Math.max(size.x, size.y, size.z) || 1
		const scale = MODEL_TARGET_SIZE / maxDimension
		root.position.sub(center)
		const group = new THREE.Group()
		group.add(root)
		group.scale.setScalar(scale)
		const halfExtents: Vec3 = [(size.x * scale) / 2, (size.y * scale) / 2, (size.z * scale) / 2]
		return {
			group,
			root,
			loaded: {
				stats: inspectModel(gltf.scene, gltf.animations.length),
				radius: Math.hypot(...halfExtents) || MODEL_TARGET_SIZE / 2,
				halfExtents,
				scale,
				clipNames: gltf.animations.map((clip) => clip.name),
			},
		}
	}, [gltf])

	useEffect(() => onLoaded(url, loaded), [url, loaded, onLoaded])

	useRenderMode(root, renderMode)

	const mixer = useMemo(() => new THREE.AnimationMixer(root), [root])
	useEffect(() => {
		const clip = gltf.animations[activeClip]
		if (!clip) return
		const action = mixer.clipAction(clip)
		action.reset().play()
		mixer.update(0)
		return () => {
			action.stop()
		}
	}, [mixer, gltf.animations, activeClip])
	useFrame((_, delta) => {
		if (isAnimating) mixer.update(delta)
	})

	const handleClick = (event: ThreeEvent<MouseEvent>) => {
		if (!acceptsClicks) return
		if (event.delta > CLICK_DRAG_TOLERANCE_PX) return
		event.stopPropagation()

		const hit = event.intersections.find(
			(intersection) => !clipPlane || clipPlane.distanceToPoint(intersection.point) >= 0
		)
		if (!hit) return
		const normal = hit.face
			? (hit.face.normal
					.clone()
					.transformDirection(hit.object.matrixWorld)
					.toArray() as Vec3)
			: undefined
		const target = controlsRef.current?.target
		onSurfaceClick({
			position: hit.point.toArray() as Vec3,
			normal,
			camera: {
				position: event.camera.position.toArray() as Vec3,
				target: target ? (target.toArray() as Vec3) : [0, 0, 0],
			},
		})
	}

	return <primitive object={group} onClick={handleClick} />
}

function PinMarker({
	pin,
	onSelect,
}: {
	pin: ModelPin
	onSelect?: (commentId: string) => void
}) {
	const [occluded, setOccluded] = useState(false)
	const position = useMemo(() => pinPosition(pin.anchor), [pin.anchor])

	return (
		<Html
			position={position}
			center
			occlude
			onOcclude={(hidden) => {
				setOccluded(hidden)
				return null
			}}
			zIndexRange={[40, 0]}
			style={{ opacity: occluded ? 0.25 : 1, transition: "opacity 150ms" }}
		>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					onSelect?.(pin.commentId)
				}}
				aria-label={pin.badge ? `Earlier feedback by ${pin.label}` : `Go to comment ${pin.number} by ${pin.label}`}
				aria-pressed={pin.selected}
				className={cn(
					"flex h-6 min-w-6 items-center justify-center rounded-full border-2 px-1 text-[11px] font-semibold shadow-md transition-transform focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-8 pointer-coarse:min-w-8",
					pin.selected
						? "scale-125 border-background bg-primary text-primary-foreground"
						: "border-primary bg-background text-foreground hover:scale-110"
				)}
			>
				{pin.badge ?? pin.number}
			</button>
		</Html>
	)
}

function PendingPinMarker({ anchor }: { anchor: ModelAnchor }) {
	const position = useMemo(() => pinPosition(anchor), [anchor])
	return (
		<Html position={position} center zIndexRange={[41, 0]}>
			<span
				aria-hidden="true"
				className="block h-3.5 w-3.5 animate-pulse rounded-full bg-primary ring-4 ring-primary/30"
			/>
		</Html>
	)
}

function Measurement({ points, scale }: { points: Vec3[]; scale: number }) {
	const [start, end] = points
	if (!start) return null
	const midpoint: Vec3 | null = end
		? [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
		: null
	return (
		<>
			{points.map((point, index) => (
				<Html key={index} position={point} center zIndexRange={[42, 0]}>
					<span
						aria-hidden="true"
						className="block h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground shadow"
					/>
				</Html>
			))}
			{end && midpoint && (
				<>
					<Line points={[start, end]} color={MEASURE_COLOR} lineWidth={2} depthTest={false} />
					<Html position={midpoint} center zIndexRange={[43, 0]}>
						<span className="whitespace-nowrap rounded-md border border-border/60 bg-background/95 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground shadow-sm">
							{formatLength(modelDistance(start, end, scale))} units
						</span>
					</Html>
				</>
			)}
		</>
	)
}

function StudioEnvironment() {
	const gl = useThree((state) => state.gl)
	const scene = useThree((state) => state.scene)
	useEffect(() => {
		const pmrem = new THREE.PMREMGenerator(gl)
		const room = new RoomEnvironment()
		const texture = pmrem.fromScene(room, 0.04).texture
		scene.environment = texture
		return () => {
			scene.environment = null
			texture.dispose()
			pmrem.dispose()
			room.dispose()
		}
	}, [gl, scene])
	return null
}

function SectionClipping({ plane }: { plane: THREE.Plane | null }) {
	const gl = useThree((state) => state.gl)
	useEffect(() => {
		gl.clippingPlanes = plane ? [plane] : []
		return () => {
			gl.clippingPlanes = []
		}
	}, [gl, plane])
	return null
}

function CameraRig({
	flyTo,
	goalRef,
	controlsRef,
}: {
	flyTo?: ModelFlyToRequest | null
	goalRef: MutableRefObject<CameraGoal | null>
	controlsRef: RefObject<OrbitControlsImpl | null>
}): null {
	const { camera } = useThree()

	useEffect(() => {
		if (!flyTo) return
		goalRef.current = {
			position: new THREE.Vector3(...flyTo.camera.position),
			target: new THREE.Vector3(...flyTo.camera.target),
		}
	}, [flyTo, goalRef])

	useFrame((_, delta) => {
		const goal = goalRef.current
		const controls = controlsRef.current
		if (!goal || !controls) return
		const t = 1 - Math.exp(-6 * delta)
		camera.position.lerp(goal.position, t)
		controls.target.lerp(goal.target, t)
		controls.update()
		if (
			camera.position.distanceTo(goal.position) < 0.01 &&
			controls.target.distanceTo(goal.target) < 0.01
		) {
			goalRef.current = null
		}
	})

	return null
}

function ViewController({
	apiRef,
	loaded,
	goalRef,
	controlsRef,
	hasPendingFlight,
}: {
	apiRef: MutableRefObject<ViewerApi | null>
	loaded: LoadedModel | null
	goalRef: MutableRefObject<CameraGoal | null>
	controlsRef: RefObject<OrbitControlsImpl | null>
	hasPendingFlight: boolean
}): null {
	const camera = useThree((state) => state.camera)
	const size = useThree((state) => state.size)
	const gl = useThree((state) => state.gl)
	const scene = useThree((state) => state.scene)
	const aspect = size.width / Math.max(1, size.height)

	useEffect(() => {
		apiRef.current = {
			flyToPreset: (preset) => {
				if (!loaded) return
				const goal = presetCamera(preset, loaded.radius, CAMERA_FOV, aspect)
				goalRef.current = {
					position: new THREE.Vector3(...goal.position),
					target: new THREE.Vector3(...goal.target),
				}
			},
			saveImage: (fileName) => {
				gl.render(scene, camera)
				gl.domElement.toBlob((blob) => {
					if (!blob) return
					const url = URL.createObjectURL(blob)
					const link = document.createElement("a")
					link.href = url
					link.download = fileName
					link.click()
					URL.revokeObjectURL(url)
				}, "image/png")
			},
		}
	}, [apiRef, aspect, camera, gl, goalRef, loaded, scene])

	const framedModelRef = useRef<LoadedModel | null>(null)
	useEffect(() => {
		const controls = controlsRef.current
		if (!loaded || !controls || framedModelRef.current === loaded) return
		framedModelRef.current = loaded
		if (hasPendingFlight) return
		const goal = presetCamera("iso", loaded.radius, CAMERA_FOV, aspect)
		camera.position.set(...goal.position)
		controls.target.set(...goal.target)
		controls.update()
	}, [aspect, camera, controlsRef, hasPendingFlight, loaded])

	return null
}

function CameraLinker({
	link,
	controlsRef,
}: {
	link: CameraLink | null | undefined
	controlsRef: RefObject<OrbitControlsImpl | null>
}): null {
	const id = useId()
	const camera = useThree((state) => state.camera)
	const applyingRemote = useRef(false)

	useEffect(() => {
		const controls = controlsRef.current
		if (!link || !controls) return
		const unsubscribe = link.subscribe(id, (state) => {
			applyingRemote.current = true
			camera.position.set(...state.position)
			controls.target.set(...state.target)
			controls.update()
			applyingRemote.current = false
		})
		const publish = () => {
			if (applyingRemote.current) return
			link.publish(id, {
				position: camera.position.toArray() as Vec3,
				target: controls.target.toArray() as Vec3,
			})
		}
		controls.addEventListener("change", publish)
		return () => {
			unsubscribe()
			controls.removeEventListener("change", publish)
		}
	}, [camera, controlsRef, id, link])

	return null
}

class ModelErrorBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false }

	static getDerivedStateFromError() {
		return { failed: true }
	}

	render() {
		if (this.state.failed) {
			return (
				<div className="flex h-full w-full items-center justify-center p-4 text-center">
					<p className="max-w-xs text-sm text-muted-foreground">
						This 3D model couldn&apos;t be displayed. The file may be
						incomplete or use a glTF feature this viewer doesn&apos;t support.
					</p>
				</div>
			)
		}
		return this.props.children
	}
}

const INITIAL_SECTION: SectionState = { enabled: false, axis: "y", fraction: 0, flipped: false }

const hintFor = (
	tool: ModelTool,
	measuredPoints: number,
	canComment: boolean,
	hasPendingPin: boolean,
	isTouch: boolean
): string | null => {
	const press = isTouch ? "Tap" : "Click"
	if (tool === "measure") {
		return measuredPoints === 1
			? `${press} a second point to measure`
			: `${press} two points on the model to measure between them`
	}
	if (canComment && !hasPendingPin) return `${press} the model to place a comment pin`
	return null
}

export function ModelAnnotationCanvas({
	modelUrl,
	canComment,
	pins,
	pendingPin,
	flyTo,
	onPlacePin,
	onSelectComment,
	cameraLink = null,
	canExport = false,
	enableShortcuts = true,
	fileName = "model",
}: ModelAnnotationCanvasProps) {
	const controlsRef = useRef<OrbitControlsImpl | null>(null)
	const flightGoal = useRef<CameraGoal | null>(null)
	const apiRef = useRef<ViewerApi | null>(null)

	const [loadedModel, setLoadedModel] = useState<{ url: string; model: LoadedModel } | null>(null)
	const loaded = loadedModel?.url === modelUrl ? loadedModel.model : null
	const [renderMode, setRenderMode] = useState<RenderMode>("shaded")
	const [lighting, setLighting] = useViewerPreference<Lighting>(LIGHTING_KEY, LIGHTINGS, "studio")
	const [showGrid, setShowGrid] = useState(false)
	const [autoRotate, setAutoRotate] = useState(false)
	const [section, setSection] = useState<SectionState>(INITIAL_SECTION)
	const [tool, setTool] = useState<ModelTool>("pin")
	const [measurePoints, setMeasurePoints] = useState<Vec3[]>([])
	const [showInfo, setShowInfo] = useState(false)
	const [activeClip, setActiveClip] = useState(0)
	const [isAnimating, setIsAnimating] = useState(false)
	const isTouch = useMediaQuery("(pointer: coarse)")

	useEffect(() => {
		setSection(INITIAL_SECTION)
		setMeasurePoints([])
		setActiveClip(0)
		setIsAnimating(false)
	}, [modelUrl])

	const handleLoaded = useCallback(
		(url: string, model: LoadedModel) => setLoadedModel({ url, model }),
		[]
	)

	const plane = useMemo(
		() =>
			section.enabled && loaded
				? sectionPlane(section.axis, section.fraction, loaded.halfExtents, section.flipped)
				: null,
		[loaded, section]
	)

	const changeTool = (next: ModelTool) => {
		setTool(next)
		setMeasurePoints([])
	}

	const handleSurfaceClick = (hit: SurfaceHit) => {
		if (tool === "measure") {
			setMeasurePoints((points) => (points.length >= 2 ? [hit.position] : [...points, hit.position]))
			return
		}
		onPlacePin?.({ position: hit.position, normal: hit.normal, camera: hit.camera })
	}

	useEffect(() => {
		if (!enableShortcuts) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) return
			if (event.key === "f" || event.key === "F") apiRef.current?.flyToPreset("iso")
			if (event.key === "Escape") changeTool("pin")
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [enableShortcuts])

	const hint = hintFor(tool, measurePoints.length, canComment, !!pendingPin, isTouch)
	const gridY = loaded ? -loaded.halfExtents[1] - 0.001 : 0
	const gridSize = loaded ? Math.ceil(Math.max(loaded.halfExtents[0], loaded.halfExtents[2]) * 4) || 8 : 8

	return (
		<div
			role="application"
			aria-label={`3D model viewer. Drag to orbit, ${isTouch ? "pinch" : "scroll"} to zoom${enableShortcuts ? ", press F to frame the model" : ""}.`}
			className="relative h-full w-full touch-none"
		>
			<ModelErrorBoundary>
				<Canvas
					camera={{ position: [3.5, 2.5, 5.5], fov: CAMERA_FOV }}
					dpr={[1, 2]}
					gl={{ antialias: true }}
				>
					{lighting === "studio" ? (
						<>
							<StudioEnvironment />
							<ambientLight intensity={0.25} />
							<directionalLight position={[5, 8, 5]} intensity={0.9} />
						</>
					) : (
						<>
							<ambientLight intensity={0.9} />
							<hemisphereLight args={["#ffffff", "#555566", 0.6]} />
							<directionalLight position={[5, 8, 5]} intensity={1.4} />
							<directionalLight position={[-5, -3, -5]} intensity={0.5} />
						</>
					)}
					<Suspense
						fallback={
							<Html center>
								<Loader2
									className="h-6 w-6 animate-spin text-muted-foreground"
									aria-label="Loading 3D model"
								/>
							</Html>
						}
					>
						<NormalizedModel
							url={modelUrl}
							renderMode={renderMode}
							activeClip={activeClip}
							isAnimating={isAnimating}
							acceptsClicks={tool === "measure" || (canComment && !!onPlacePin)}
							clipPlane={plane}
							onLoaded={handleLoaded}
							onSurfaceClick={handleSurfaceClick}
							controlsRef={controlsRef}
						/>
						{pins.map((pin) => (
							<PinMarker key={pin.commentId} pin={pin} onSelect={onSelectComment} />
						))}
						{pendingPin && <PendingPinMarker anchor={pendingPin} />}
						{loaded && <Measurement points={measurePoints} scale={loaded.scale} />}
					</Suspense>
					{showGrid && (
						<gridHelper
							args={[gridSize, GRID_DIVISIONS, "#8a8a93", "#55555c"]}
							position={[0, gridY, 0]}
						/>
					)}
					<SectionClipping plane={plane} />
					<OrbitControls
						ref={controlsRef}
						makeDefault
						enableDamping
						autoRotate={autoRotate}
						autoRotateSpeed={1.5}
						onStart={() => {
							flightGoal.current = null
						}}
					/>
					<CameraRig flyTo={flyTo} goalRef={flightGoal} controlsRef={controlsRef} />
					<ViewController
						apiRef={apiRef}
						loaded={loaded}
						goalRef={flightGoal}
						controlsRef={controlsRef}
						hasPendingFlight={!!flyTo}
					/>
					<CameraLinker link={cameraLink} controlsRef={controlsRef} />
				</Canvas>
				<ModelViewerToolbar
					stats={loaded?.stats ?? null}
					clipNames={loaded?.clipNames ?? []}
					renderMode={renderMode}
					onRenderModeChange={setRenderMode}
					lighting={lighting}
					onLightingChange={setLighting}
					showGrid={showGrid}
					onToggleGrid={() => setShowGrid((value) => !value)}
					autoRotate={autoRotate}
					onToggleAutoRotate={() => setAutoRotate((value) => !value)}
					section={section}
					onSectionChange={setSection}
					tool={tool}
					onToolChange={changeTool}
					showInfo={showInfo}
					onToggleInfo={() => setShowInfo((value) => !value)}
					activeClip={activeClip}
					onActiveClipChange={setActiveClip}
					isAnimating={isAnimating}
					onToggleAnimating={() => setIsAnimating((value) => !value)}
					onPreset={(preset) => apiRef.current?.flyToPreset(preset)}
					onSaveImage={
						canExport ? () => apiRef.current?.saveImage(`${fileName}-view.png`) : undefined
					}
				/>
			</ModelErrorBoundary>
			{hint && (
				<p className="pointer-events-none absolute bottom-3 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">
					{hint}
				</p>
			)}
		</div>
	)
}
