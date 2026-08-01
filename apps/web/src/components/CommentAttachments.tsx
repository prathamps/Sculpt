"use client"

import { FileTextIcon } from "lucide-react"
import { CommentAttachment } from "@/types"
import { mediaUrl } from "@/lib/utils"

export function CommentAttachments({
	attachments,
}: {
	attachments?: CommentAttachment[]
}) {
	if (!attachments || attachments.length === 0) return null

	return (
		<ul className="mt-2 flex flex-wrap gap-2">
			{attachments.map((attachment) => (
				<li key={attachment.id}>
					<a
						href={mediaUrl(attachment.url)}
						target="_blank"
						rel="noopener noreferrer"
						className="block rounded-md border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title={attachment.fileName}
					>
						{attachment.mimeType.startsWith("image/") ? (
							<img
								src={mediaUrl(attachment.url)}
								alt={attachment.fileName}
								className="h-16 w-16 rounded-md object-cover"
							/>
						) : (
							<span className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md bg-muted/50 px-1 text-[10px] text-muted-foreground">
								<FileTextIcon className="h-5 w-5" aria-hidden="true" />
								<span className="w-full truncate text-center">
									{attachment.fileName}
								</span>
							</span>
						)}
					</a>
				</li>
			))}
		</ul>
	)
}
