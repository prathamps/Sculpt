"use client"

import {
	Pencil,
	Minus,
	RectangleHorizontal,
	Trash2,
	Palette,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AnnotationTool } from "@/app/projects/[projectId]/page"

interface AnnotationToolbarProps {
	tool: AnnotationTool
	setTool: (tool: AnnotationTool) => void
	color: string
	setColor: (color: string) => void
}

export function AnnotationToolbar({
	tool,
	setTool,
	color,
	setColor,
}: AnnotationToolbarProps) {
	const tools: { name: AnnotationTool; icon: React.ElementType }[] = [
		{ name: "pencil", icon: Pencil },
		{ name: "rect", icon: RectangleHorizontal },
		{ name: "line", icon: Minus },
	]

	const colors = [
		"#E8EBF1",
		"#A4B7D8",
		"#F3A9A3",
		"#4783E8",
		"#20A3A8",
		"#A990E4",
		"#E84747",
		"#F3A3CB",
		"#F3D9A3",
		"#90E4A9",
		"#90E4C3",
		"#E88147",
		"#E8B047",
		"#E4C390",
		"#D8A4A4",
		"#47E881",
		"#47E8B0",
		"#0E9347",
		"#0E6239",
	]

	return (
		<div className="flex items-center gap-2 rounded-md bg-gray-900/50 p-1">
			{tools.map(({ name, icon: Icon }) => (
				<button
					key={name}
					onClick={() => setTool(name)}
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-md",
						tool === name
							? "bg-blue-500 text-white"
							: "text-gray-300 hover:bg-gray-700"
					)}
				>
					<Icon className="h-5 w-5" />
				</button>
			))}

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className="h-8 w-8 cursor-pointer rounded-md border-2 border-gray-700"
						style={{ backgroundColor: color }}
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="grid grid-cols-5 gap-2 p-2">
					{colors.map((c, index) => (
						<button
							key={`${c}-${index}`}
							onClick={() => setColor(c)}
							className={cn(
								"h-8 w-8 rounded-md",
								color.toUpperCase() === c.toUpperCase() && "ring-2 ring-white"
							)}
							style={{ backgroundColor: c }}
						/>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
