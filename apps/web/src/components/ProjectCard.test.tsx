import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ProjectCard } from "./ProjectCard"
import { Project } from "@/types"

vi.mock("next/link", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const project = (overrides: Partial<Project> = {}): Project => ({
	id: "p1",
	name: "Launch campaign",
	coverImage: null,
	imageCount: 0,
	members: [],
	createdAt: "2026-03-01T00:00:00.000Z",
	...overrides,
})

const renderCard = (value: Project) =>
	render(
		<ProjectCard project={value} onEdit={vi.fn()} onDelete={vi.fn()} />
	)

describe("ProjectCard", () => {
	it("reports the server-side file count rather than counting a loaded list", () => {
		renderCard(project({ imageCount: 237 }))
		expect(screen.getByText(/237/)).toBeDefined()
		expect(screen.getByText(/files/)).toBeDefined()
	})

	it("uses the singular noun for a single file", () => {
		renderCard(project({ imageCount: 1 }))
		expect(screen.getByText(/file\b/)).toBeDefined()
	})

	it("renders the cover image the summary endpoint supplies", () => {
		renderCard(
			project({
				imageCount: 4,
				coverImage: {
					id: "i1",
					name: "hero.png",
					folderId: null,
					latestVersion: { url: "uploads/hero.png" },
				} as unknown as Project["coverImage"],
			})
		)
		const image = screen.getByAltText("Launch campaign") as HTMLImageElement
		expect(image.src).toContain("/uploads/hero.png")
	})

	it("falls back gracefully when a project has no media yet", () => {
		renderCard(project())
		expect(screen.queryByAltText("Launch campaign")).toBeNull()
	})
})
