import { useCallback, useRef } from "react"
import { MentionPick } from "@/components/MentionTextarea"

export function useMentionDraft() {
	const picksRef = useRef<MentionPick[]>([])

	const addMention = useCallback((pick: MentionPick) => {
		if (!picksRef.current.some((entry) => entry.id === pick.id)) {
			picksRef.current = [...picksRef.current, pick]
		}
	}, [])

	const mentionIdsIn = useCallback(
		(content: string): string[] =>
			picksRef.current
				.filter((entry) => content.includes(`@${entry.label}`))
				.map((entry) => entry.id),
		[]
	)

	const resetMentions = useCallback(() => {
		picksRef.current = []
	}, [])

	return { addMention, mentionIdsIn, resetMentions }
}
