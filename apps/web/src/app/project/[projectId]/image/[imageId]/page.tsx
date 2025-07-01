"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/context/AuthContext"
import { useRouter, useParams } from "next/navigation"
import { AnnotationCanvas } from "@/components/AnnotationCanvas"
import { AnnotationFooter } from "@/components/AnnotationFooter"
import { CommentSidebar } from "@/components/CommentSidebar"
import { TopHeader } from "@/components/TopHeader"
import { Loader2 } from "lucide-react"

interface Image {
	id: string
	url: string
	name: string
}

export type AnnotationTool = "pencil" | "rect" | "line"

interface Annotation {
	id: number
	type: AnnotationTool
	color: string
	points: { x: number; y: number }[]
}

export default function ProjectFileViewPage() {
	const params = useParams()
	const { isAuthenticated, loading } = useAuth()
	const router = useRouter()
	const [image, setImage] = useState<Image | null>(null)
	const [tool, setTool] = useState<AnnotationTool>("pencil")
	const [color, setColor] = useState("#4783E8")
	const [clearCounter, setClearCounter] = useState(0)
	const [isImageLoading, setIsImageLoading] = useState(true)

	const [annotations, setAnnotations] = useState<Annotation[]>([])
	const [history, setHistory] = useState<Annotation[][]>([[]])
	const [historyIndex, setHistoryIndex] = useState(0)
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)

	const imageId = params.imageId as string
	const projectId = params.projectId as string

	const handleAddAnnotation = (newAnnotation: Omit<Annotation, "id">) => {
		setAnnotations((prev) => {
			const nextAnnotations = [...prev, { ...newAnnotation, id: prev.length }]
			const newHistory = history.slice(0, historyIndex + 1)
			newHistory.push(nextAnnotations)
			setHistory(newHistory)
			setHistoryIndex(newHistory.length - 1)
			return nextAnnotations
		})
	}

	const handleUndo = () => {
		if (historyIndex > 0) {
			const newIndex = historyIndex - 1
			setHistoryIndex(newIndex)
			setAnnotations(history[newIndex])
		}
	}

	const handleRedo = () => {
		if (historyIndex < history.length - 1) {
			const newIndex = historyIndex + 1
			setHistoryIndex(newIndex)
			setAnnotations(history[newIndex])
		}
	}

	const fetchImage = useCallback(async () => {
		if (isAuthenticated) {
			setIsImageLoading(true)
			try {
				const res = await fetch(`http://localhost:3001/api/images/${imageId}`, {
					credentials: "include",
				})
				if (res.ok) {
					const data = await res.json()
					setImage(data)
				}
			} catch (error) {
				console.error("Failed to fetch image:", error)
			} finally {
				setIsImageLoading(false)
			}
		}
	}, [isAuthenticated, imageId])

	useEffect(() => {
		if (!loading && !isAuthenticated) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router])

	useEffect(() => {
		fetchImage()
	}, [fetchImage])

	const handleClear = () => {
		setClearCounter((c) => c + 1)
		setAnnotations([])
		setHistory([[]])
		setHistoryIndex(0)
	}

	const toggleSidebar = () => {
		setIsSidebarOpen(!isSidebarOpen)
	}

	if (loading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	return (
		<div className="flex h-screen w-full flex-col bg-background text-foreground">
			<TopHeader
				imageName={image?.name || "Image"}
				projectId={projectId}
				onToggleSidebar={toggleSidebar}
				isSidebarOpen={isSidebarOpen}
			/>
			<div className="flex flex-1 overflow-hidden">
				<main className="relative flex flex-1 flex-col">
					{/* Canvas Section */}
					<div className="flex-1 flex items-center justify-center bg-muted/20">
						{isImageLoading ? (
							<div className="flex h-full w-full items-center justify-center">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : (
							<AnnotationCanvas
								imageUrl={image ? `http://localhost:3001/${image.url}` : ""}
								tool={tool}
								color={color}
								onAddAnnotation={handleAddAnnotation}
								annotations={annotations}
							/>
						)}
					</div>
					{/* Footer/Toolbar Section */}
					<div className="border-t border-border">
						<AnnotationFooter
							tool={tool}
							setTool={setTool}
							color={color}
							setColor={setColor}
							onUndo={handleUndo}
							onRedo={handleRedo}
							onClear={handleClear}
							canUndo={historyIndex > 0}
							canRedo={historyIndex < history.length - 1}
						/>
					</div>
				</main>
				{isSidebarOpen && <CommentSidebar />}
			</div>
		</div>
	)
}
