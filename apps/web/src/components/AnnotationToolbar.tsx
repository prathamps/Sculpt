"use client"

import { Pencil, Minus, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
	DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"

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
	const tools: {
		name: AnnotationTool
		icon: React.ElementType
		label: string
	}[] = [
		{ name: "pencil", icon: Pencil, label: "Pencil Tool" },
		{ name: "rect", icon: Square, label: "Rectangle Tool" },
		{ name: "line", icon: Minus, label: "Line Tool" },
	]

	const colors = [
		{ value: "#E8EBF1", label: "Light Gray" },
		{ value: "#4783E8", label: "Blue" },
		{ value: "#E84747", label: "Red" },
		{ value: "#47E881", label: "Green" },
		{ value: "#E88147", label: "Orange" },
		{ value: "#A990E4", label: "Purple" },
		{ value: "#F3D9A3", label: "Yellow" },
		{ value: "#F3A3CB", label: "Pink" },
		{ value: "#20A3A8", label: "Teal" },
	]

	return (
		<div className="flex items-center gap-1 rounded-md border border-border/50 bg-background/60 p-0.5">
			<TooltipProvider>
				{tools.map(({ name, icon: Icon, label }) => (
					<Tooltip key={name}>
						<TooltipTrigger asChild>
							<button
								onClick={() => setTool(name)}
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-sm transition-colors",
									tool === name
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground"
								)}
							>
								<Icon className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="text-xs">
							{label}
						</TooltipContent>
					</Tooltip>
				))}

				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<button
									className="h-7 w-7 cursor-pointer rounded-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
									style={{ backgroundColor: color }}
								/>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="text-xs">
							Choose Color
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent className="w-48 p-2" align="center">
						<DropdownMenuLabel className="text-xs font-medium">
							Select Color
						</DropdownMenuLabel>
						<div className="mt-2 grid grid-cols-3 gap-1">
							{colors.map(({ value, label }) => (
								<Tooltip key={value}>
									<TooltipTrigger asChild>
										<button
											onClick={() => setColor(value)}
											className={cn(
												"h-8 w-full rounded transition-all",
												color.toUpperCase() === value.toUpperCase() &&
													"ring-2 ring-ring ring-offset-2 ring-offset-card"
											)}
											style={{ backgroundColor: value }}
										/>
									</TooltipTrigger>
									<TooltipContent side="bottom" className="text-xs">
										{label}
									</TooltipContent>
								</Tooltip>
							))}
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
			</TooltipProvider>
		</div>
	)
}
