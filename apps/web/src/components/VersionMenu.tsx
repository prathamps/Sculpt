"use client"

import { ChevronDown, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ImageVersion } from "@/types"

interface VersionMenuProps {
	versions: ImageVersion[]
	selectedVersion: ImageVersion | null
	canEdit: boolean
	onSelect: (version: ImageVersion) => void
	onRequestDelete: (version: ImageVersion) => void
	onRequestUpload: () => void
}

export function VersionMenu({
	versions,
	selectedVersion,
	canEdit,
	onSelect,
	onRequestDelete,
	onRequestUpload,
}: VersionMenuProps) {
	const canDeleteVersions = versions.length > 1 && canEdit

	return (
		<div className="flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="max-w-[9rem] shrink-0 gap-1 sm:max-w-none">
						<span className="truncate">{selectedVersion?.versionName || "Select version"}</span>
						<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{versions.map((version) => (
						<DropdownMenuItem
							key={version.id}
							onClick={() => onSelect(version)}
							className={selectedVersion?.id === version.id ? "bg-accent" : ""}
						>
							<div className="flex w-full justify-between items-center">
								<span>{version.versionName}</span>
								{canDeleteVersions && (
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 ml-2 text-destructive"
										onClick={(event) => {
											event.stopPropagation()
											onRequestDelete(version)
										}}
										aria-label={`Delete ${version.versionName}`}
									>
										<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
									</Button>
								)}
							</div>
						</DropdownMenuItem>
					))}
					{canEdit && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onRequestUpload}>
								<Upload className="mr-2 h-4 w-4" aria-hidden="true" />
								Upload new version
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
