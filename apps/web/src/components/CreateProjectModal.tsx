"use client"

import { useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Plus } from "lucide-react"
import { Project } from "@/types"

interface CreateProjectModalProps {
	onProjectCreated: (project: Project) => void
	isOpen: boolean
	setIsOpen: (isOpen: boolean) => void
}

export function CreateProjectModal({
	onProjectCreated,
	isOpen,
	setIsOpen,
}: CreateProjectModalProps) {
	const [projectName, setProjectName] = useState("")
	const [error, setError] = useState("")

	const handleSubmit = async () => {
		if (!projectName) {
			setError("Project name is required.")
			return
		}
		setError("")

		const res = await fetch("http://localhost:3001/api/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: projectName }),
			credentials: "include",
		})

		if (res.ok) {
			const newProject = await res.json()
			onProjectCreated(newProject)
			setIsOpen(false)
			setProjectName("")
		} else {
			const data = await res.json()
			setError(data.message || "Failed to create project.")
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create a new project</DialogTitle>
					<DialogDescription>
						Give your project a name to get started.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="name" className="text-right">
							Name
						</Label>
						<Input
							id="name"
							value={projectName}
							onChange={(e) => setProjectName(e.target.value)}
							className="col-span-3"
							autoFocus
						/>
					</div>
					{error && <p className="text-red-500 text-sm col-span-4">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={handleSubmit}>Create Project</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
