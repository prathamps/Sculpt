"use client"

import { useState } from "react"
import {
	Globe,
	Paperclip,
	Mic,
	Send,
	Minus,
	RectangleHorizontal,
	Pencil,
	Undo,
	Redo,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnnotationToolbar } from "./AnnotationToolbar"
import { AnnotationTool } from "@/app/projects/[projectId]/page"

interface AnnotationFooterProps {
	tool: AnnotationTool
	setTool: (tool: AnnotationTool) => void
	color: string
	setColor: (color: string) => void
	onUndo: () => void
	onRedo: () => void
}

export function AnnotationFooter({
	tool,
	setTool,
	color,
	setColor,
	onUndo,
	onRedo,
}: AnnotationFooterProps) {
	const [comment, setComment] = useState("")

	return (
		<div className="space-y-2 rounded-lg bg-[#1e1f22] p-2">
			{/* Top row with comment input */}
			<div className="flex items-start gap-2">
				<Avatar className="h-8 w-8">
					<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
					<AvatarFallback>CN</AvatarFallback>
				</Avatar>
				<Textarea
					placeholder="Leave your comment..."
					value={comment}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
						setComment(e.target.value)
					}
					className="min-h-[40px] flex-1 resize-none border-0 bg-transparent text-white focus:ring-0 focus:outline-none"
				/>
				<Button size="icon" variant="ghost">
					<Send className="h-5 w-5" />
				</Button>
			</div>
			{/* Bottom row with tools */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					<Button size="icon" variant="ghost">
						<Globe className="h-5 w-5" />
					</Button>
					<Button size="icon" variant="ghost">
						<Mic className="h-5 w-5" />
					</Button>
				</div>
				<div className="flex items-center gap-1">
					<AnnotationToolbar
						tool={tool}
						setTool={setTool}
						color={color}
						setColor={setColor}
					/>
					<Button size="icon" variant="ghost" onClick={onUndo}>
						<Undo className="h-5 w-5" />
					</Button>
					<Button size="icon" variant="ghost" onClick={onRedo}>
						<Redo className="h-5 w-5" />
					</Button>
				</div>
			</div>
		</div>
	)
}
