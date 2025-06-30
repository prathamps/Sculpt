"use client"
import { CommentCard, Comment } from "./CommentCard"
import { Button } from "./ui/button"
import { AlignLeft } from "lucide-react"

const comments: Comment[] = [
	{
		id: "1",
		author: {
			name: "Marion Scott",
			avatarUrl: "https://randomuser.me/api/portraits/women/1.jpg",
		},
		timestamp: "Today 9:32 am",
		text: "@Marion_Scott please take a look this and suggest the changes",
	},
	{
		id: "2",
		author: {
			name: "Marion Scott",
			avatarUrl: "https://randomuser.me/api/portraits/women/2.jpg",
		},
		timestamp: "Today 9:32 am",
		text: "@Marion_Scott please take a look this and suggest the changes",
	},
	{
		id: "3",
		author: {
			name: "Lisa Seely",
			avatarUrl: "https://randomuser.me/api/portraits/women/3.jpg",
		},
		timestamp: "Today 9:32 am",
		text: "I want to leave a comment here",
		reactions: 2,
		replies: [
			{
				id: "3-1",
				author: {
					name: "Marion Scott",
					avatarUrl: "https://randomuser.me/api/portraits/men/1.jpg",
				},
				timestamp: "Today 9:33 am",
				text: "Sure, go ahead.",
			},
		],
	},
]

export function CommentSidebar() {
	return (
		<aside className="hidden w-80 flex-col border-l border-gray-700 bg-[#1e1f22] lg:flex">
			<div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-700 px-4">
				<h2 className="text-lg font-semibold">Showing All 34 Comments</h2>
				<Button size="icon" variant="ghost">
					<AlignLeft className="h-5 w-5" />
				</Button>
			</div>
			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				{comments.map((comment) => (
					<CommentCard key={comment.id} comment={comment} />
				))}
			</div>
		</aside>
	)
}
