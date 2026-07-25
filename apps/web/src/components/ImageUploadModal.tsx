"use client"

import { useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
	UploadCloud,
	File as FileIcon,
	X,
	Loader2,
	AlertCircle,
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import {
	captureThumbnail,
	getVideoDuration,
	withMimeTypeTheApiCanMap,
} from "@/lib/media-capture"

const ACCEPTED_TYPES =
	"image/*,video/mp4,video/webm,video/quicktime,application/pdf,.glb,model/gltf-binary"

const isAcceptedFile = (file: File) =>
	file.type.startsWith("image/") ||
	["video/mp4", "video/webm", "video/quicktime", "application/pdf"].includes(
		file.type
	) ||
	file.name.toLowerCase().endsWith(".glb")

interface ImageUploadModalProps {
	projectId: string | null
	isOpen: boolean
	onClose: () => void
	onUploadComplete: () => void
	imageId?: string
}

export function ImageUploadModal({
	projectId,
	isOpen,
	onClose,
	onUploadComplete,
	imageId,
}: ImageUploadModalProps) {
	const [files, setFiles] = useState<File[]>([])
	const [isUploading, setIsUploading] = useState(false)
	const [uploadProgress, setUploadProgress] = useState(0)
	const [error, setError] = useState("")
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const selectedFiles = Array.from(e.target.files)
			const validFiles = selectedFiles.filter(isAcceptedFile)

			if (validFiles.length !== selectedFiles.length) {
				setError(
					"Only image, video (MP4, WebM, MOV), PDF and GLB 3D model files are allowed."
				)
			} else {
				setError("")
			}

			if (imageId && validFiles.length > 1) {
				setFiles([validFiles[0]])
				setError("Only one file can be uploaded as a new version.")
			} else {
				setFiles(validFiles)
			}
		}
	}

	const handleRemoveFile = (index: number) => {
		setFiles((prev) => prev.filter((_, i) => i !== index))
	}

	const simulateProgress = () => {
		setUploadProgress(0)
		const interval = setInterval(() => {
			setUploadProgress((prev) => {
				if (prev >= 95) {
					clearInterval(interval)
					return 95
				}
				return prev + 5
			})
		}, 200)

		return () => clearInterval(interval)
	}

	const handleUpload = async () => {
		if (files.length === 0 || (!projectId && !imageId)) {
			setError("Please select at least one file to upload.")
			return
		}
		setIsUploading(true)
		setError("")

		const clearProgressSimulation = simulateProgress()

		const formData = new FormData()

		try {
			let res

			if (imageId && files.length > 0) {
				const fileToUpload = withMimeTypeTheApiCanMap(files[0])
				formData.append("image", fileToUpload)
				if (fileToUpload.type.startsWith("video/")) {
					const duration = await getVideoDuration(fileToUpload)
					if (duration != null) formData.append("duration", String(duration))
				}
				const thumbnail = await captureThumbnail(fileToUpload)
				if (thumbnail) {
					formData.append("thumbnail", thumbnail, "thumbnail.jpg")
				}

				res = await fetch(`${URI}/api/images/${imageId}/versions`, {
					method: "POST",
					body: formData,
					credentials: "include",
				})
			} else {
				const filesMeta: { duration: number | null; hasThumbnail: boolean }[] =
					[]
				for (const selected of files) {
					const file = withMimeTypeTheApiCanMap(selected)
					formData.append("images", file)
					const duration = file.type.startsWith("video/")
						? await getVideoDuration(file)
						: null
					const thumbnail = await captureThumbnail(file)
					if (thumbnail) {
						formData.append("thumbnails", thumbnail, "thumbnail.jpg")
					}
					filesMeta.push({ duration, hasThumbnail: !!thumbnail })
				}
				formData.append("filesMeta", JSON.stringify(filesMeta))

				res = await fetch(`${URI}/api/projects/${projectId}/images`, {
					method: "POST",
					body: formData,
					credentials: "include",
				})
			}

			if (!res.ok) {
				throw new Error("Upload failed")
			}

			setUploadProgress(100)
			setTimeout(() => {
				onUploadComplete()
				onClose()
			}, 500)
		} catch {
			setError("An error occurred during upload.")
			setUploadProgress(0)
		} finally {
			clearProgressSimulation()
			setIsUploading(false)
		}
	}

	const isVersionUpload = Boolean(imageId)
	const title = isVersionUpload ? "Upload New Version" : "Upload Files"
	const description = isVersionUpload
		? "Add a new version to your image."
		: "Add images, videos, PDFs or 3D models to your project."

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{isUploading ? (
					<div className="space-y-4 py-4">
						<div className="flex flex-col items-center justify-center text-center space-y-2">
							<Loader2 className="h-8 w-8 animate-spin text-primary" />
							<h3 className="font-medium">
								Uploading {files.length} file{files.length !== 1 ? "s" : ""}
							</h3>
							<p className="text-sm text-muted-foreground">
								This may take a moment depending on the file size
							</p>
						</div>
						<Progress value={uploadProgress} className="h-2 w-full bg-muted" />
						<p className="text-xs text-center text-muted-foreground">
							Files are being uploaded to temporary storage
						</p>
					</div>
				) : (
					<>
						<div className="flex items-center justify-center w-full">
							<label
								htmlFor="dropzone-file"
								className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-lg cursor-pointer bg-muted/40 hover:bg-muted/60 transition-colors"
							>
								<div className="flex flex-col items-center justify-center pt-5 pb-6">
									<UploadCloud className="w-8 h-8 mb-3 text-primary/80" />
									<p className="mb-2 text-sm text-foreground">
										<span className="font-semibold">Click to upload</span> or
										drag and drop
									</p>
									<p className="text-xs text-muted-foreground">
										Images (JPG, PNG, WebP), videos (MP4, WebM, MOV), PDFs or
										3D models (GLB)
									</p>
									{isVersionUpload && (
										<p className="text-xs text-muted-foreground mt-1">
											Only one file can be selected for a new version
										</p>
									)}
								</div>
								<Input
									id="dropzone-file"
									type="file"
									multiple={!isVersionUpload}
									className="hidden"
									onChange={handleFileChange}
									accept={ACCEPTED_TYPES}
								/>
							</label>
						</div>

						{error && (
							<div className="flex items-center gap-2 text-destructive text-sm">
								<AlertCircle className="h-4 w-4" />
								<span>{error}</span>
							</div>
						)}

						{files.length > 0 && (
							<div className="mt-4 space-y-2">
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium">Selected files</p>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
										onClick={() => setFiles([])}
									>
										Clear all
									</Button>
								</div>
								<div className="max-h-40 overflow-y-auto space-y-2 pr-1">
									{files.map((file, i) => (
										<div
											key={i}
											className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded-md p-2"
										>
											<div className="flex items-center gap-2 truncate">
												<FileIcon className="h-4 w-4 flex-shrink-0 text-primary/70" />
												<span className="truncate max-w-[15rem]">
													{file.name}
												</span>
												<span className="text-xs text-muted-foreground">
													{(file.size / 1024).toFixed(0)} KB
												</span>
											</div>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6 text-muted-foreground hover:text-destructive"
												onClick={() => handleRemoveFile(i)}
											>
												<X className="h-3.5 w-3.5" />
											</Button>
										</div>
									))}
								</div>
							</div>
						)}
					</>
				)}

				<DialogFooter>
					{!isUploading && (
						<>
							<Button
								variant="outline"
								onClick={onClose}
								disabled={isUploading}
							>
								Cancel
							</Button>
							<Button
								onClick={handleUpload}
								disabled={isUploading || files.length === 0}
								className="bg-primary hover:bg-primary/90"
							>
								{isUploading
									? "Uploading..."
									: `Upload ${files.length > 0 ? files.length : ""} file${
											files.length !== 1 ? "s" : ""
									  }`}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
