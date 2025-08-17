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
	const [error, setError] = useState("")

	useEffect(() => {
		if (file) {
			setName(file.name)
			setError("")
		}
	}, [file])

	if (!file) return null

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!name.trim()) {
			setError("File name cannot be empty")
			return
		}

		// Check if file name has changed
		if (name === file.name) {
			onClose()
			return
		}

		setIsSaving(true)
		setError("")

		try {
			const res = await fetch(`http://localhost:3001/api/images/${file.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name }),
			})

			if (!res.ok) {
				const errorData = await res.json().catch((): null => null)
				throw new Error(errorData?.message || "Failed to rename file.")
			}

			// Get updated file data
			const updatedFile = await res.json()

			// Update the file object in-place rather than refreshing the whole list
			// This ensures the file stays in the same position in the list
			file.name = updatedFile.name || name

			// Call the callback for UI updates but with minimal impact
			onFileRenamed()
			onClose()
		} catch (error) {
			console.error("Failed to rename file", error)
			setError(
				error instanceof Error ? error.message : "Failed to rename file."
			)
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
							className="bg-background/80 border-border/50 focus-visible:ring-primary/30"
							placeholder="Enter file name"
							autoFocus
						/>
						{error && <p className="text-sm text-destructive mt-1">{error}</p>}
					</div>

					<DialogFooter className="flex space-x-2 justify-end">
						<Button
							onClick={onClose}
							variant="outline"
							type="button"
							size="sm"
							className="hover:text-primary hover:border-primary/50"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={isSaving || !name.trim() || name === file.name}
							className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
