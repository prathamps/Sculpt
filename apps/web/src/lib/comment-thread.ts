import { Comment } from "@/types"

const holdsReply = (comment: Comment, id: string): boolean =>
	!!comment.replies?.some((reply) => reply.id === id)

export const threadContains = (thread: Comment[], id: string): boolean =>
	thread.some((comment) => comment.id === id || holdsReply(comment, id))

export const insertIntoThread = (thread: Comment[], incoming: Comment): Comment[] => {
	if (threadContains(thread, incoming.id)) return thread
	if (!incoming.parentId) return [incoming, ...thread]
	return thread.map((comment) =>
		comment.id === incoming.parentId
			? { ...comment, replies: [...(comment.replies ?? []), incoming] }
			: comment
	)
}

export const updateInThread = (
	thread: Comment[],
	id: string,
	update: (comment: Comment) => Comment
): Comment[] =>
	thread.map((comment) => {
		if (comment.id === id) return update(comment)
		if (!holdsReply(comment, id)) return comment
		return {
			...comment,
			replies: comment.replies?.map((reply) =>
				reply.id === id ? update(reply) : reply
			),
		}
	})

export const removeFromThread = (thread: Comment[], id: string): Comment[] =>
	thread
		.filter((comment) => comment.id !== id)
		.map((comment) =>
			holdsReply(comment, id)
				? {
						...comment,
						replies: comment.replies?.filter((reply) => reply.id !== id),
					}
				: comment
		)

export const mergePages = (pages: Comment[][]): Comment[] => {
	const seen = new Set<string>()
	return pages.flat().filter((comment) => {
		if (seen.has(comment.id)) return false
		seen.add(comment.id)
		return true
	})
}
