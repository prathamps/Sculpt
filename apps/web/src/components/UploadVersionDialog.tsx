"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Image } from "@/types"
import {
	captureThumbnail,
	getVideoDuration,
	thumbnailFileName,
	withMimeTypeTheApiCanMap,
} from "@/lib/media-capture"
import { prepareModelUpload } from "@/lib/model-capture"
import { isModelFile } from "@/lib/model-formats"
import { FILE_INPUT_ACCEPT } from "@/lib/upload-formats"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface UploadVersionDialogProps {
	imageId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onUploaded: (image: Image) => void
}

export function UploadVersionDialog({
	imageId,
	open,
	onOpenChange,
	onUploaded,
}: UploadVersionDialogProps) {
	const [uploadFile, setUploadFile] = useState<File | null>(null)
	const [versionName, setVersionName] = useState("")
	const [isUploading, setIsUploading] = useState(false)

	const handleUpload = async () => {
		if (!uploadFile || !imageId) return

		setIsUploading(true)
		try {
			const fileToUpload = withMimeTypeTheApiCanMap(uploadFile)
			const formData = new FormData()
			formData.append("image", fileToUpload)
			if (versionName) {
				formData.append("versionName", versionName)
			}

			if (fileToUpload.type.startsWith("video/")) {
				const duration = await getVideoDuration(fileToUpload)
				if (duration != null) formData.append("duration", String(duration))
			}
			const prepared = isModelFile(fileToUpload)
				? await prepareModelUpload(fileToUpload)
				: null
			const thumbnail = prepared
				? prepared.thumbnail
				: await captureThumbnail(fileToUpload)
			if (thumbnail) {
				formData.append("thumbnail", thumbnail, thumbnailFileName(thumbnail))
			}
			if (prepared?.glb) {
				formData.append("modelProxy", prepared.glb, "converted.glb")
			}

			const res = await fetch(`${API_URL}/api/images/${imageId}/versions`, {
				method: "POST",
				credentials: "include",
				body: formData,
			})

			if (res.ok) {
				onUploaded(await res.json())
				onOpenChange(false)
				setUploadFile(null)
				setVersionName("")
			} else {
				const data = await res.json().catch(() => null)
				toast.error(data?.message || "Failed to upload the new version.")
			}
		} catch (error) {
			console.error("Failed to upload new version:", error)
			toast.error("Failed to upload the new version.")
		} finally {
			setIsUploading(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Upload New Version</DialogTitle>
					<DialogDescription>
						Upload a new version (image, video, PDF or 3D model) of this file
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Input
							type="text"
							placeholder="Version name (optional)"
							aria-label="Version name"
							value={versionName}
							onChange={(e) => setVersionName(e.target.value)}
						/>
					</div>
					<div>
						<Input
							type="file"
							aria-label="Version file"
							onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
							accept={FILE_INPUT_ACCEPT}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleUpload}
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
	)
}
