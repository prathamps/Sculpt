"use client"

import { useState, useEffect } from "react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Image as File } from "@/types"
import { Loader2 } from "lucide-react"

interface RenameFileModalProps {
	isOpen: boolean
	onClose: () => void
	file: File | null
	onFileRenamed: () => void
}

export function RenameFileModal({
	isOpen,
	onClose,
	file,
	onFileRenamed,
}: RenameFileModalProps) {
	const [name, setName] = useState("")
	const [isSaving, setIsSaving] = useState(false)

	useEffect(() => {
		if (file) {
			setName(file.name)
		}
	}, [file])

	if (!file) return null

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSaving(true)
		try {
			const res = await fetch(`http://localhost:3001/api/images/${file.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name }),
			})

			if (!res.ok) {
				throw new Error("Failed to rename file.")
			}

			onFileRenamed()
			onClose()
		} catch (error) {
			console.error("Failed to save file settings", error)
			alert("Failed to rename file.")
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md border-border bg-card">
				<form onSubmit={handleSave}>
					<DialogHeader>
						<DialogTitle>Rename File</DialogTitle>
						<DialogDescription>
							Enter a new name for this file.
						</DialogDescription>
					</DialogHeader>

					<div className="py-4 space-y-2">
						<Label htmlFor="name" className="text-sm font-medium">
							File Name
						</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="bg-background/80 border-border/50"
							placeholder="Enter file name"
							autoFocus
						/>
					</div>

					<DialogFooter className="flex space-x-2 justify-end">
						<Button onClick={onClose} variant="outline" type="button" size="sm">
							Cancel
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={isSaving || !name.trim() || name === file.name}
						>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving
								</>
							) : (
								"Save Changes"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
