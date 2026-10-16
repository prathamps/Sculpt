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
import { Switch } from "@/components/ui/switch"
import { Project } from "@/types"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

interface ProjectSettingsModalProps {
	isOpen: boolean
	onClose: () => void
	project: Project | null
	onProjectChanged: () => void
}

interface ProjectSettings {
	name: string
	allowDownloads: boolean
	watermarkViewers: boolean
}

const settingsOf = (project: Project): ProjectSettings => ({
	name: project.name,
	allowDownloads: project.allowDownloads ?? true,
	watermarkViewers: project.watermarkViewers ?? false,
})

const changesBetween = (
	saved: ProjectSettings,
	edited: ProjectSettings
): Partial<ProjectSettings> =>
	Object.fromEntries(
		(Object.keys(edited) as (keyof ProjectSettings)[])
			.filter((key) => edited[key] !== saved[key])
			.map((key) => [key, key === "name" ? edited.name.trim() : edited[key]])
	)

export function ProjectSettingsModal({
	isOpen,
	onClose,
	project,
	onProjectChanged,
}: ProjectSettingsModalProps) {
	const [settings, setSettings] = useState<ProjectSettings | null>(null)
	const [isSaving, setIsSaving] = useState(false)

	useEffect(() => {
		if (project) setSettings(settingsOf(project))
	}, [project])

	if (!project || !settings) return null

	const changes = changesBetween(settingsOf(project), settings)
	const hasChanges = Object.keys(changes).length > 0

	const handleSave = async (event: React.FormEvent) => {
		event.preventDefault()
		setIsSaving(true)
		try {
			await api.put(`/api/projects/${project.id}`, changes)
			onProjectChanged()
			onClose()
		} catch (error) {
			toast.error(describeError(error, "Could not save project settings."))
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

					<div className="py-4 space-y-5">
						<div className="space-y-2">
							<Label htmlFor="name" className="text-sm font-medium">
								Project Name
							</Label>
							<Input
								id="name"
								value={settings.name}
								onChange={(event) => setSettings({ ...settings, name: event.target.value })}
								className="bg-background/80 border-border/50"
								placeholder="Enter project name"
								autoFocus
							/>
						</div>

						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<Label htmlFor="allow-downloads">Allow downloads</Label>
								<p id="allow-downloads-help" className="text-xs text-muted-foreground">
									When off, viewers and members can stream files but only editors and owners can download originals.
								</p>
							</div>
							<Switch
								id="allow-downloads"
								checked={settings.allowDownloads}
								onCheckedChange={(checked) => setSettings({ ...settings, allowDownloads: checked })}
								aria-describedby="allow-downloads-help"
							/>
						</div>

						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<Label htmlFor="watermark-viewers">Watermark the viewer</Label>
								<p id="watermark-viewers-help" className="text-xs text-muted-foreground">
									Overlays each person&apos;s email address and the date on everything they view, so screenshots can be traced.
								</p>
							</div>
							<Switch
								id="watermark-viewers"
								checked={settings.watermarkViewers}
								onCheckedChange={(checked) => setSettings({ ...settings, watermarkViewers: checked })}
								aria-describedby="watermark-viewers-help"
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
							disabled={isSaving || !settings.name.trim() || !hasChanges}
						>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
