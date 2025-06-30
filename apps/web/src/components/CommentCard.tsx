import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ThumbsUp, MessageSquareReply } from "lucide-react"

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
}

interface CommentCardProps {
	comment: Comment
}

export function CommentCard({ comment }: CommentCardProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-3">
				<Avatar className="h-8 w-8">
					<AvatarImage src={comment.author.avatarUrl} />
					<AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
				</Avatar>
				<div className="flex-1 space-y-1">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="font-semibold">{comment.author.name}</span>
							<span className="text-xs text-gray-400">{comment.timestamp}</span>
						</div>
						<div className="flex items-center gap-1">
							<Button size="icon" variant="ghost" className="h-6 w-6">
								<ThumbsUp className="h-4 w-4" />
							</Button>
							{comment.reactions && (
								<span className="text-xs">{comment.reactions}</span>
							)}
						</div>
					</div>
					<p className="text-sm text-gray-200">{comment.text}</p>
					<Button
						variant="ghost"
						className="h-auto p-0 text-xs text-gray-400 hover:bg-transparent"
					>
						<MessageSquareReply className="mr-1 h-3 w-3" />
						Reply
					</Button>
				</div>
			</div>
			{comment.replies && comment.replies.length > 0 && (
				<div className="ml-11 flex flex-col gap-3 border-l-2 border-gray-700 pl-4">
					{comment.replies.map((reply) => (
						<CommentCard key={reply.id} comment={reply} />
					))}
				</div>
			)}
		</div>
	)
}
