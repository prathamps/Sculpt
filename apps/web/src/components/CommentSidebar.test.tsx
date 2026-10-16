import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CommentSidebar } from "./CommentSidebar"
import { Comment } from "@/types"

vi.mock("./CommentCard", () => ({
	CommentCard: ({ comment }: { comment: Comment }) => (
		<div>{comment.content}</div>
	),
}))

const comment = (id: string, content: string): Comment =>
	({
		id,
		content,
		imageVersionId: "v1",
		createdAt: "2026-03-01T00:00:00.000Z",
		user: { id: "u1", name: "Ada", email: "ada@example.com" },
		likeCount: 0,
		isLikedByCurrentUser: false,
		replies: [],
	}) as unknown as Comment

const renderSidebar = (props: Record<string, unknown> = {}) =>
	render(
		<CommentSidebar
			comments={[comment("c1", "First note")]}
			onRefresh={vi.fn()}
			onSelectComment={vi.fn()}
			selectedCommentId={null}
			canReply
			{...props}
		/>
	)

describe("CommentSidebar paging", () => {
	it("hides the load-more control when everything is loaded", () => {
		renderSidebar({ hasMore: false })
		expect(screen.queryByText("Load older comments")).toBeNull()
	})

	it("offers to load older comments when more pages remain", () => {
		renderSidebar({ hasMore: true })
		expect(screen.getByText("Load older comments")).toBeDefined()
	})

	it("asks for the next page when the control is used", () => {
		const onLoadMore = vi.fn()
		renderSidebar({ hasMore: true, onLoadMore })

		fireEvent.click(screen.getByText("Load older comments"))

		expect(onLoadMore).toHaveBeenCalledTimes(1)
	})

	it("blocks a second request while one is in flight", () => {
		const onLoadMore = vi.fn()
		renderSidebar({ hasMore: true, isLoadingMore: true, onLoadMore })

		const button = screen
			.getByText("Loading older comments")
			.closest("button") as HTMLButtonElement
		expect(button.disabled).toBe(true)
	})
})
