import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
	ThumbsUp,
	MessageSquareReply,
	MoreHorizontal,
	CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface Comment {
	id: string
	author: {
		name: string
		avatarUrl: string
	}
	timestamp: string
	text: string
	replies?: Comment[]
	reactions?: number
	resolved?: boolean
}

interface CommentCardProps {
	comment: Comment
}

export function CommentCard({ comment }: CommentCardProps) {
	const isResolved = comment.resolved || false

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-2.5">
				<Avatar className="h-7 w-7 flex-shrink-0">
					<AvatarImage
						src={comment.author.avatarUrl}
						alt={comment.author.name}
					/>
					<AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
				</Avatar>
				<div className="flex-1 space-y-1.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">{comment.author.name}</span>
							<span className="text-xs text-muted-foreground">
								{comment.timestamp}
							</span>
							{isResolved && (
								<span className="flex items-center gap-1 text-xs text-green-500">
									<CheckCircle2 className="h-3 w-3" />
									Resolved
								</span>
							)}
						</div>
						<div className="flex items-center gap-1">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 text-muted-foreground"
									>
										<MoreHorizontal className="h-3.5 w-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-48">
									<DropdownMenuItem className="text-xs">
										Mark as {isResolved ? "unresolved" : "resolved"}
									</DropdownMenuItem>
									<DropdownMenuItem className="text-xs">
										Copy link to comment
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem className="text-xs text-destructive">
										Delete comment
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
					<p className="text-sm leading-relaxed">{comment.text}</p>
					<div className="flex items-center gap-3">
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground",
								comment.reactions && comment.reactions > 0 && "text-primary"
							)}
						>
							<ThumbsUp className="h-3.5 w-3.5" />
							{comment.reactions ? comment.reactions : "Like"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
						>
							<MessageSquareReply className="h-3.5 w-3.5" />
							Reply
						</Button>
					</div>
				</div>
			</div>
			{comment.replies && comment.replies.length > 0 && (
				<div className="ml-9 flex flex-col gap-3 border-l-2 border-border/50 pl-3">
					{comment.replies.map((reply) => (
						<CommentCard key={reply.id} comment={reply} />
					))}
				</div>
			)}
		</div>
	)
}
