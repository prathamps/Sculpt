"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/context/AuthContext"
import { useRouter, useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { AnnotationCanvas } from "@/components/AnnotationCanvas"
import { AnnotationFooter } from "@/components/AnnotationFooter"
import { CommentSidebar } from "@/components/CommentSidebar"
import { TopHeader } from "@/components/TopHeader"
import { Send, ChevronLeft } from "lucide-react"

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
	const [color, setColor] = useState("#ff0000")
	const [clearCounter, setClearCounter] = useState(0)

	const [annotations, setAnnotations] = useState<Annotation[]>([])
	const [history, setHistory] = useState<Annotation[][]>([[]])
	const [historyIndex, setHistoryIndex] = useState(0)

	const imageId = params.projectId as string

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
			const res = await fetch(`http://localhost:3001/api/images/${imageId}`, {
				credentials: "include",
			})
			if (res.ok) {
				const data = await res.json()
				setImage(data)
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
	}

	if (loading || !image) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-[#121212] text-white">
				<p>Loading...</p>
			</div>
		)
	}

	return (
		<div className="flex h-screen w-full flex-col bg-[#121212] text-white">
			<TopHeader imageName={image.name || "Image"} />
			<div className="flex flex-1 flex-col overflow-hidden md:flex-row">
				<main className="flex-1 flex flex-col">
					{/* Canvas Section */}
					<div className="flex-1 relative flex items-center justify-center bg-[#2b2d31]">
						<AnnotationCanvas
							imageUrl={`http://localhost:3001/${image.url}`}
							tool={tool}
							color={color}
							onAddAnnotation={handleAddAnnotation}
							annotations={annotations}
						/>
					</div>
					{/* Footer/Toolbar Section */}
					<div className="border-t border-gray-700 p-4">
						<AnnotationFooter
							tool={tool}
							setTool={setTool}
							color={color}
							setColor={setColor}
							onUndo={handleUndo}
							onRedo={handleRedo}
						/>
					</div>
				</main>
				<CommentSidebar />
			</div>
		</div>
	)
}
