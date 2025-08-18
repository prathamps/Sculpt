"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { useRouter, useParams } from "next/navigation"
import { AnnotationCanvas } from "@/components/AnnotationCanvas"
import { AnnotationFooter } from "@/components/AnnotationFooter"
import { CommentSidebar } from "@/components/CommentSidebar"
import { TopHeader } from "@/components/TopHeader"
import { Loader2, ChevronDown, Upload, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Image, ImageVersion } from "@/types"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// Custom hook for media queries
function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false)

	useEffect(() => {
		// Safety check for SSR
		if (typeof window === "undefined") return

		// Initialize with the current match state
		const media = window.matchMedia(query)
		setMatches(media.matches)

		// Create handler function
		const listener = (event: MediaQueryListEvent) => {
			setMatches(event.matches)
		}

		// Add the listener
		media.addEventListener("change", listener)

		// Clean up
		return () => {
			media.removeEventListener("change", listener)
		}
	}, [query])

	return matches
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
	const { socket } = useSocket()
	const router = useRouter()
	const [image, setImage] = useState<Image | null>(null)
	const [selectedVersion, setSelectedVersion] = useState<ImageVersion | null>(
		null
	)
	const [tool, setTool] = useState<AnnotationTool>("pencil")
	const [color, setColor] = useState("#4783E8")
	const [clearCounter, setClearCounter] = useState(0)
	const [isImageLoading, setIsImageLoading] = useState(true)
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
	const [uploadFile, setUploadFile] = useState<File | null>(null)
	const [versionName, setVersionName] = useState("")
	const [isUploading, setIsUploading] = useState(false)

	const [annotations, setAnnotations] = useState<Annotation[]>([])
	const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(
		null
	)
	const [highlightedAnnotation, setHighlightedAnnotation] = useState<
		Annotation[] | null
	>(null)
	const [history, setHistory] = useState<Annotation[][]>([[]])
	const [historyIndex, setHistoryIndex] = useState(0)
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)

	// Use media query to determine if we're on a small screen
	const isSmallScreen = useMediaQuery("(max-width: 768px)")

	// State to track if component is mounted (for SSR)
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	const imageId = params.imageId as string
	const projectId = params.projectId as string

	const handleAddAnnotation = (newAnnotation: Omit<Annotation, "id">) => {
		const annotationWithId = { ...newAnnotation, id: annotations.length }
		setCurrentAnnotation(annotationWithId)

		setAnnotations((prev) => {
			const nextAnnotations = [...prev, annotationWithId]
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
			setAnnotations(history[newIndex] || [])
		}
	}

	const handleRedo = () => {
		if (historyIndex < history.length - 1) {
			const newIndex = historyIndex + 1
			setHistoryIndex(newIndex)
			setAnnotations(history[newIndex] || [])
		}
	}

	const fetchImage = useCallback(async () => {
		if (isAuthenticated) {
			setIsImageLoading(true)
			const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
			try {
				const res = await fetch(`${URI}/api/images/${imageId}`, {
					credentials: "include",
				})
				if (res.ok) {
					const data = await res.json()
					console.log("Fetched image data:", data)
					setImage(data)

					// Select the latest version by default
					if (data.latestVersion) {
						// Use latestVersion if available (should be the first in versions array)
						setSelectedVersion(data.latestVersion)
					} else if (data.versions && data.versions.length > 0) {
						// Fallback to first version in array
						setSelectedVersion(data.versions[0])
					}
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
		setCurrentAnnotation(null)
		setHighlightedAnnotation(null)
		setHistory([[]])
		setHistoryIndex(0)
	}

	const toggleSidebar = () => {
		setIsSidebarOpen(!isSidebarOpen)
	}

	const handleVersionSelect = (version: ImageVersion) => {
		setSelectedVersion(version)
		// Reset annotations when switching versions
		setAnnotations([])
		setHistory([[]])
		setHistoryIndex(0)
	}

	const handleUploadNewVersion = async () => {
		if (!uploadFile || !imageId) return

		setIsUploading(true)
		try {
			const formData = new FormData()
			formData.append("image", uploadFile)
			if (versionName) {
				formData.append("versionName", versionName)
			}

			const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
			const res = await fetch(`${URI}/api/images/${imageId}/versions`, {
				method: "POST",
				credentials: "include",
				body: formData,
			})

			if (res.ok) {
				// The response now contains the full enriched image
				const updatedImage = await res.json()
				console.log("Received updated image:", updatedImage)

				// Set the full image data
				setImage(updatedImage)

				// Set the latest version as selected (it's the first in the array)
				if (updatedImage.versions && updatedImage.versions.length > 0) {
					setSelectedVersion(updatedImage.versions[0])
				}

				setIsUploadModalOpen(false)
				setUploadFile(null)
				setVersionName("")
			}
		} catch (error) {
			console.error("Failed to upload new version:", error)
		} finally {
			setIsUploading(false)
		}
	}

	const handleDeleteVersion = async (versionId: string) => {
		if (!confirm("Are you sure you want to delete this version?")) return

		try {
			const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
			const res = await fetch(`${URI}/api/images/versions/${versionId}`, {
				method: "DELETE",
				credentials: "include",
			})

			if (res.ok) {
				// Update the image state by removing the deleted version
				setImage((prev) => {
					if (!prev) return null
					const updatedVersions = prev.versions.filter(
						(v) => v.id !== versionId
					)
					return { ...prev, versions: updatedVersions }
				})

				// If the deleted version was selected, select the first available version
				if (selectedVersion?.id === versionId) {
					const remainingVersions =
						image?.versions.filter((v) => v.id !== versionId) || []
					if (remainingVersions.length > 0) {
						// Make sure we don't pass undefined to setSelectedVersion
						const firstVersion = remainingVersions[0]
						if (firstVersion) {
							setSelectedVersion(firstVersion)
						} else {
							setSelectedVersion(null)
						}
					} else {
						setSelectedVersion(null)
					}
				}
			} else {
				const errorData = await res.json()
				alert(errorData.message || "Failed to delete version")
			}
		} catch (error) {
			console.error("Error deleting version:", error)
			alert("An error occurred while deleting the version")
		}
	}

	const handleHighlightAnnotation = (annotation: any) => {
		if (!annotation) return

		// Convert the stored JSON annotation to the format our component expects
		// If it's an array of annotations, process each one
		const annotations = Array.isArray(annotation) ? annotation : [annotation]

		// Map each annotation to add the highlighted flag
		const highlightedAnnotations = annotations.map((ann) => ({
			id: ann.id || 0,
			type: ann.type || "pencil",
			color: ann.color || "#4783E8",
			points: ann.points || [],
			isHighlighted: true,
		}))

		// Set the highlighted annotation(s)
		setHighlightedAnnotation(highlightedAnnotations)

		// Clear the highlight after 2 seconds
		setTimeout(() => {
			setHighlightedAnnotation(null)
		}, 2000)
	}

	// Handle comment added
	const handleCommentAdded = () => {
		console.log("[ImagePage] Comment added, current socket status:", {
			socketConnected: !!socket?.connected,
			socketId: socket?.id,
			currentImageVersion: selectedVersion?.id,
		})

		setCurrentAnnotation(null)

		// Refresh comments by triggering a re-fetch
		if (selectedVersion) {
			// Comments will be refreshed through the CommentSidebar component
		}
	}
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	if (loading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	// Don't render layout until component is mounted
	if (!isMounted) {
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
			>
				{/* Version selector dropdown */}
				{image && image.versions && image.versions.length > 0 && (
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="gap-1">
									{selectedVersion?.versionName || "Select version"}
									<ChevronDown className="h-3.5 w-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{image.versions.map((version) => (
									<DropdownMenuItem
										key={version.id}
										onClick={() => handleVersionSelect(version)}
										className={
											selectedVersion?.id === version.id ? "bg-accent" : ""
										}
									>
										<div className="flex w-full justify-between items-center">
											<span>{version.versionName}</span>
											{image.versions.length > 1 && (
												<Button
													variant="ghost"
													size="icon"
													className="h-6 w-6 ml-2 text-destructive"
													onClick={(e) => {
														e.stopPropagation()
														handleDeleteVersion(version.id)
													}}
												>
													<Trash2 className="h-3.5 w-3.5" />
												</Button>
											)}
										</div>
									</DropdownMenuItem>
								))}
								<DropdownMenuSeparator />
								{image.versions.length < 2 && (
									<DropdownMenuItem onClick={() => setIsUploadModalOpen(true)}>
										<Upload className="mr-2 h-4 w-4" />
										Upload new version
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
			</TopHeader>
			<div
				className={`flex flex-1 overflow-hidden ${
					isSmallScreen ? "flex-col" : "flex-row"
				}`}
			>
				<main
					className={`relative flex flex-1 flex-col ${
						isSmallScreen && isSidebarOpen ? "h-[60%]" : "h-full"
					}`}
				>
					{/* Canvas Section */}
					<div className="flex-1 flex items-center justify-center bg-muted/20 overflow-auto">
						{isImageLoading ? (
							<div className="flex h-full w-full items-center justify-center">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : selectedVersion ? (
							<AnnotationCanvas
								imageUrl={`${URI}/${selectedVersion.url}`}
								tool={tool}
								color={color}
								onAddAnnotation={handleAddAnnotation}
								annotations={
									highlightedAnnotation
										? [
												...annotations.map((a) => ({
													...a,
													isHighlighted: false,
												})),
												...(Array.isArray(highlightedAnnotation)
													? highlightedAnnotation
													: [highlightedAnnotation]),
										  ]
										: annotations
								}
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<p className="text-muted-foreground">No version available</p>
							</div>
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
							currentAnnotation={currentAnnotation}
							annotations={annotations}
							imageVersionId={selectedVersion?.id || ""}
							onCommentAdded={handleCommentAdded}
						/>
					</div>
				</main>
				{isSidebarOpen && selectedVersion && (
					<CommentSidebar
						imageVersionId={selectedVersion.id}
						className={
							isSmallScreen
								? "h-[40%] w-full border-t border-l-0"
								: "h-full w-80 border-l"
						}
						onHighlightAnnotation={handleHighlightAnnotation}
					/>
				)}
			</div>

			{/* Upload New Version Modal */}
			<Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Upload New Version</DialogTitle>
						<DialogDescription>
							Upload a new version of this image
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<Input
								type="text"
								placeholder="Version name (optional)"
								value={versionName}
								onChange={(e) => setVersionName(e.target.value)}
							/>
						</div>
						<div>
							<Input
								type="file"
								onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
								accept="image/*"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setIsUploadModalOpen(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={handleUploadNewVersion}
								disabled={!uploadFile || isUploading}
							>
								{isUploading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Uploading...
									</>
								) : (
									"Upload"
								)}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
