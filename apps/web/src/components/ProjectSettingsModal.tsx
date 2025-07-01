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
import { Project } from "@/types"
import { Loader2 } from "lucide-react"

interface ProjectSettingsModalProps {
	isOpen: boolean
	onClose: () => void
	project: Project | null
	onProjectChanged: () => void
}

export function ProjectSettingsModal({
	isOpen,
	onClose,
	project,
	onProjectChanged,
}: ProjectSettingsModalProps) {
	const [name, setName] = useState("")
	const [isSaving, setIsSaving] = useState(false)

	useEffect(() => {
		if (project) {
			setName(project.name)
		}
	}, [project])

	if (!project) return null

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSaving(true)
		try {
			const res = await fetch(
				`http://localhost:3001/api/projects/${project.id}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ name }),
				}
			)

			if (!res.ok) {
				throw new Error("Failed to update project.")
			}

			onProjectChanged()
			onClose()
		} catch (error) {
			console.error("Failed to save project settings", error)
			alert("Failed to save project settings.")
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md border-border bg-card">
				<form onSubmit={handleSave}>
					<DialogHeader>
						<DialogTitle>Project Settings</DialogTitle>
						<DialogDescription>
							Update settings for your project.
						</DialogDescription>
					</DialogHeader>

					<div className="py-4 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name" className="text-sm font-medium">
								Project Name
							</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="bg-background/80 border-border/50"
								placeholder="Enter project name"
								autoFocus
							/>
						</div>
					</div>

					<DialogFooter className="flex space-x-2 justify-end">
						<Button onClick={onClose} variant="outline" type="button" size="sm">
							Cancel
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={isSaving || !name.trim() || name === project.name}
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
