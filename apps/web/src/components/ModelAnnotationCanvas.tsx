"use client"

import {
	Component,
	ReactNode,
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import {
	Canvas,
	ThreeEvent,
	useFrame,
	useLoader,
	useThree,
} from "@react-three/fiber"
import { Html, OrbitControls } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { Loader2 } from "lucide-react"
import { ModelAnchor, Vec3 } from "@/types"
import { cn } from "@/lib/utils"

const MODEL_TARGET_SIZE = 4
const CLICK_DRAG_TOLERANCE_PX = 4
const PIN_SURFACE_OFFSET = 0.06

export interface ModelPin {
	commentId: string
	number: number
	label: string
	anchor: ModelAnchor
	selected: boolean
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
}

type CameraGoal = { position: THREE.Vector3; target: THREE.Vector3 }

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

function NormalizedModel({
	url,
	canPlacePin,
	onPlacePin,
	controlsRef,
}: {
	url: string
	canPlacePin: boolean
	onPlacePin?: (anchor: ModelAnchor) => void
	controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
	const gltf = useLoader(GLTFLoader, url)

	const scene = useMemo(() => {
		const root = gltf.scene.clone(true)
		const box = new THREE.Box3().setFromObject(root)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		const maxDimension = Math.max(size.x, size.y, size.z) || 1
		root.position.sub(center)
		const group = new THREE.Group()
		group.add(root)
		group.scale.setScalar(MODEL_TARGET_SIZE / maxDimension)
		return group
	}, [gltf])

	const handleClick = (event: ThreeEvent<MouseEvent>) => {
		if (!canPlacePin || !onPlacePin) return
		if (event.delta > CLICK_DRAG_TOLERANCE_PX) return
		event.stopPropagation()

		const normal = event.face
			? (event.face.normal
					.clone()
					.transformDirection(event.object.matrixWorld)
					.toArray() as Vec3)
			: undefined
		const target = controlsRef.current?.target
		onPlacePin({
			position: event.point.toArray() as Vec3,
			normal,
			camera: {
				position: event.camera.position.toArray() as Vec3,
				target: target ? (target.toArray() as Vec3) : [0, 0, 0],
			},
		})
	}

	return <primitive object={scene} onClick={handleClick} />
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
				aria-label={`Go to comment ${pin.number} by ${pin.label}`}
				aria-pressed={pin.selected}
				className={cn(
					"flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold shadow-md transition-transform focus-visible:ring-2 focus-visible:ring-ring",
					pin.selected
						? "scale-125 border-background bg-primary text-primary-foreground"
						: "border-primary bg-background text-foreground hover:scale-110"
				)}
			>
				{pin.number}
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

function CameraRig({
	flyTo,
	goalRef,
	controlsRef,
}: {
	flyTo?: ModelFlyToRequest | null
	goalRef: React.MutableRefObject<CameraGoal | null>
	controlsRef: React.RefObject<OrbitControlsImpl | null>
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
						This 3D model couldn&apos;t be loaded. It may be corrupted or use
						an unsupported compression (e.g. Draco).
					</p>
				</div>
			)
		}
		return this.props.children
	}
}

export function ModelAnnotationCanvas({
	modelUrl,
	canComment,
	pins,
	pendingPin,
	flyTo,
	onPlacePin,
	onSelectComment,
}: ModelAnnotationCanvasProps) {
	const controlsRef = useRef<OrbitControlsImpl | null>(null)
	const flightGoal = useRef<CameraGoal | null>(null)

	return (
		<div
			role="application"
			aria-label="3D model viewer. Drag to orbit, scroll to zoom."
			className="relative h-full w-full"
		>
			<ModelErrorBoundary>
				<Canvas camera={{ position: [3.5, 2.5, 5.5], fov: 45 }} dpr={[1, 2]}>
					<ambientLight intensity={0.9} />
					<hemisphereLight args={["#ffffff", "#555566", 0.6]} />
					<directionalLight position={[5, 8, 5]} intensity={1.4} />
					<directionalLight position={[-5, -3, -5]} intensity={0.5} />
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
							canPlacePin={canComment}
							onPlacePin={onPlacePin}
							controlsRef={controlsRef}
						/>
						{pins.map((pin) => (
							<PinMarker
								key={pin.commentId}
								pin={pin}
								onSelect={onSelectComment}
							/>
						))}
						{pendingPin && <PendingPinMarker anchor={pendingPin} />}
					</Suspense>
					<OrbitControls
						ref={controlsRef}
						makeDefault
						enableDamping
						onStart={() => {
							flightGoal.current = null
						}}
					/>
					<CameraRig
						flyTo={flyTo}
						goalRef={flightGoal}
						controlsRef={controlsRef}
					/>
				</Canvas>
			</ModelErrorBoundary>
			{canComment && !pendingPin && (
				<p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm">
					Click the model to place a comment pin
				</p>
			)}
		</div>
	)
}
