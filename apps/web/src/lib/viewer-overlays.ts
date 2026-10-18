import type { ModelPin } from "@/components/ModelAnnotationCanvas"
import type { ScrubberMarker, ScrubberPeer } from "@/components/Scrubber"
import type { PresencePeer } from "@/hooks/usePresence"
import { Annotation, Comment, ModelAnchor, RevisionCheckItem } from "@/types"

export const annotationsOf = (comment: Comment): Annotation[] =>
	Array.isArray(comment.annotation)
		? comment.annotation
		: comment.annotation
			? [comment.annotation]
			: []

const authorName = (comment: Comment): string =>
	comment.user.name || comment.user.email

export const timelineMarkersFor = (
	comments: Comment[],
	selectedCommentId: string | null
): ScrubberMarker[] =>
	comments
		.filter((comment) => typeof comment.timestamp === "number")
		.map((comment) => {
			const name = authorName(comment)
			return {
				commentId: comment.id,
				t: comment.timestamp as number,
				tEnd:
					typeof comment.timestampEnd === "number"
						? comment.timestampEnd
						: undefined,
				label: name,
				initial: name.charAt(0).toUpperCase(),
				selected: comment.id === selectedCommentId,
			}
		})

export interface CanvasAnnotationInput {
	drafts: Annotation[]
	comments: Comment[]
	selectedComment: Comment | null
	selectedCommentId: string | null
	isVideo: boolean
	isPdf: boolean
	currentPdfPage: number
	showAllAnnotations: boolean
}

const videoAnnotations = ({
	drafts,
	comments,
	selectedComment,
}: CanvasAnnotationInput): Annotation[] => {
	const visibleComments = selectedComment ? [selectedComment] : comments
	const fromComments = visibleComments.flatMap((comment) =>
		annotationsOf(comment).map((annotation) => ({
			...annotation,
			t: typeof comment.timestamp === "number" ? comment.timestamp : annotation.t,
			tEnd:
				typeof comment.timestampEnd === "number"
					? comment.timestampEnd
					: annotation.tEnd,
			isHighlighted: !!selectedComment,
			pinned: !!selectedComment,
		}))
	)
	return [
		...drafts.map(
			(annotation): Annotation => ({ ...annotation, t: undefined, tEnd: undefined })
		),
		...fromComments,
	]
}

const pageOf = (comment: Comment): number => comment.page ?? 1

const stillAnnotations = (input: CanvasAnnotationInput): Annotation[] => {
	const { comments, selectedComment, selectedCommentId, isPdf, currentPdfPage } =
		input
	const onThisPage = isPdf
		? comments.filter((comment) => pageOf(comment) === currentPdfPage)
		: comments

	if (input.showAllAnnotations) {
		return onThisPage.flatMap((comment) =>
			annotationsOf(comment).map((annotation) => ({
				...annotation,
				isHighlighted: comment.id === selectedCommentId,
				dimmed: comment.id !== selectedCommentId,
			}))
		)
	}
	if (selectedComment && (!isPdf || pageOf(selectedComment) === currentPdfPage)) {
		return annotationsOf(selectedComment).map((annotation) => ({
			...annotation,
			isHighlighted: true,
		}))
	}
	return []
}

export const canvasAnnotationsFor = (input: CanvasAnnotationInput): Annotation[] =>
	input.isVideo
		? videoAnnotations(input)
		: [...input.drafts, ...stillAnnotations(input)]

export const scrubberPeersFor = (peers: PresencePeer[]): ScrubberPeer[] =>
	peers.map((peer) => ({
		socketId: peer.socketId,
		name: peer.user.name || "Someone",
		initial: (peer.user.name || "S").charAt(0).toUpperCase(),
		time: peer.time,
	}))

export interface ViewingPerson {
	name: string
	avatarUrl: string | null
}

export const viewingPeopleFor = (peers: PresencePeer[]): ViewingPerson[] => {
	const byUser = new Map<string, ViewingPerson>()
	peers.forEach((peer) => {
		if (byUser.has(peer.user.id)) return
		byUser.set(peer.user.id, {
			name: peer.user.name || "Someone",
			avatarUrl: peer.user.avatarUrl ?? null,
		})
	})
	return Array.from(byUser.values())
}

export const modelPinsFor = (
	comments: Comment[],
	selectedCommentId: string | null
): ModelPin[] =>
	comments
		.filter((comment) => comment.modelAnchor)
		.slice()
		.sort(
			(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
		)
		.map((comment, index) => ({
			commentId: comment.id,
			number: index + 1,
			label: authorName(comment),
			anchor: comment.modelAnchor as ModelAnchor,
			selected: comment.id === selectedCommentId,
		}))

const annotationsOfItem = (item: RevisionCheckItem): Annotation[] =>
	Array.isArray(item.annotation) ? item.annotation : item.annotation ? [item.annotation] : []

export const carriedAnnotationsFor = (
	item: RevisionCheckItem | null,
	view: { isVideo: boolean; isPdf: boolean; currentPdfPage: number }
): Annotation[] => {
	if (!item) return []
	if (view.isPdf && (item.page ?? 1) !== view.currentPdfPage) return []
	return annotationsOfItem(item).map((annotation) => ({
		...annotation,
		isHighlighted: true,
		...(view.isVideo
			? {
					t: item.timestamp ?? annotation.t,
					tEnd: item.timestampEnd ?? annotation.tEnd,
					pinned: true,
				}
			: { t: undefined, tEnd: undefined }),
	}))
}

export const carriedModelPinFor = (item: RevisionCheckItem | null): ModelPin | null =>
	item?.modelAnchor
		? {
				commentId: `carried:${item.commentId}`,
				number: item.fromVersion.versionNumber,
				badge: `V${item.fromVersion.versionNumber}`,
				label: `${item.author.name || item.author.email} on ${item.fromVersion.versionName}`,
				anchor: item.modelAnchor,
				selected: true,
			}
		: null
