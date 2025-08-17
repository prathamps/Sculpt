"use client"

import { useState, FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ImageUploadFormProps {
	projectId: string
	onUploadComplete: () => void
}

export function ImageUploadForm({
	projectId,
	onUploadComplete,
}: ImageUploadFormProps) {
	const [file, setFile] = useState<File | null>(null)
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			setFile(e.target.files[0])
		}
	}

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault()
		if (!file) {
			return
		}

		const formData = new FormData()
		formData.append("image", file)

		await fetch(`${URI}/api/projects/${projectId}/images`, {
			method: "POST",
			credentials: "include",
			body: formData,
		})

		onUploadComplete()
		setFile(null)
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div>
				<Label htmlFor="image-upload" className="sr-only">
					Upload New Image
				</Label>
				<Input
					id="image-upload"
					type="file"
					onChange={handleFileChange}
					className="mb-2 w-full bg-[#333] border-none rounded-md text-white focus:bg-[#444] focus:outline-none focus:ring-2 focus:ring-[#a45945]"
				/>
			</div>
			<Button
				type="submit"
				disabled={!file}
				className="w-full bg-[#a45945] hover:bg-[#871f1f]"
			>
				Upload
			</Button>
		</form>
	)
}
