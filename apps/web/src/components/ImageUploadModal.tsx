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
import { UploadCloud, File as FileIcon } from "lucide-react"

interface ImageUploadModalProps {
	projectId: string | null
	isOpen: boolean
	onClose: () => void
	onUploadComplete: () => void
}

export function ImageUploadModal({
	projectId,
	isOpen,
	onClose,
	onUploadComplete,
}: ImageUploadModalProps) {
	const [files, setFiles] = useState<File[]>([])
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState("")

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			setFiles(Array.from(e.target.files))
		}
	}

	const handleUpload = async () => {
		if (files.length === 0 || !projectId) {
			setError("Please select at least one file to upload.")
			return
		}
		setIsUploading(true)
		setError("")

		const formData = new FormData()
		files.forEach((file) => {
			formData.append("images", file)
		})

		try {
			const res = await fetch(
				`http://localhost:3001/api/projects/${projectId}/images`,
				{
					method: "POST",
					body: formData,
					credentials: "include",
				}
			)

			if (!res.ok) {
				throw new Error("Upload failed")
			}
			onUploadComplete()
			onClose()
		} catch (err) {
			setError("An error occurred during upload.")
		} finally {
			setIsUploading(false)
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Upload Files</DialogTitle>
					<DialogDescription>
						Add images or videos to your project.
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center justify-center w-full">
					<label
						htmlFor="dropzone-file"
						className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-800 hover:bg-gray-700"
					>
						<div className="flex flex-col items-center justify-center pt-5 pb-6">
							<UploadCloud className="w-8 h-8 mb-4 text-gray-400" />
							<p className="mb-2 text-sm text-gray-400">
								<span className="font-semibold">Click to upload</span> or drag
								and drop
							</p>
							<p className="text-xs text-gray-500">
								SVG, PNG, JPG or GIF (MAX. 800x400px)
							</p>
						</div>
						<Input
							id="dropzone-file"
							type="file"
							multiple
							className="hidden"
							onChange={handleFileChange}
						/>
					</label>
				</div>
				{files.length > 0 && (
					<div className="mt-4 space-y-2">
						<p className="font-semibold">Selected files:</p>
						{files.map((file, i) => (
							<div key={i} className="flex items-center gap-2 text-sm">
								<FileIcon className="h-4 w-4" />
								<span>{file.name}</span>
							</div>
						))}
					</div>
				)}
				{error && <p className="text-red-500 text-sm">{error}</p>}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isUploading}>
						Cancel
					</Button>
					<Button
						onClick={handleUpload}
						disabled={isUploading || files.length === 0}
					>
						{isUploading ? "Uploading..." : "Upload"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
