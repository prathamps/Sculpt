import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { accessibilityViolations } from "@/test-support/axe"
import { TwoFactorChallengeForm } from "./TwoFactorChallengeForm"
import { CopyableLink } from "./CopyableLink"
import { VersionMenu } from "./VersionMenu"
import { ViewerPresenceStrip } from "./ViewerPresenceStrip"
import { LoadMoreTrigger } from "./LoadMoreTrigger"
import { MemberList } from "./MemberList"
import { ProjectSettingsModal } from "./ProjectSettingsModal"
import { AdminAuditLog } from "./AdminAuditLog"
import { ImageVersion, Project, ProjectMember } from "@/types"

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", ResizeObserverStub)
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			new Response(JSON.stringify({ total: 0, page: 1, pageSize: 25, logs: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		)
	)
})

const versions = [
	{ id: "v1", versionName: "Version 1" },
	{ id: "v2", versionName: "Version 2" },
] as ImageVersion[]

const members = [
	{ role: "OWNER", user: { id: "u1", name: "Ada", email: "ada@example.com" } },
	{ role: "VIEWER", user: { id: "u2", name: null, email: "grace@example.com" } },
] as ProjectMember[]

const project = {
	id: "p1",
	name: "Launch film",
	allowDownloads: true,
	watermarkViewers: false,
	members,
	coverImage: null,
	imageCount: 0,
	createdAt: "2026-01-01T00:00:00.000Z",
} as Project

describe("accessibility", () => {
	it("the two-factor challenge has labelled controls", async () => {
		const { container } = render(<TwoFactorChallengeForm onVerified={vi.fn()} onCancel={vi.fn()} />)
		expect(await accessibilityViolations(container)).toEqual([])
	})

	it("a copyable link names its field and button", async () => {
		const { container } = render(<CopyableLink url="https://example.com/join/abc" label="New share link" />)
		expect(await accessibilityViolations(container)).toEqual([])
	})

	it("the version menu and presence strip are labelled", async () => {
		const { container } = render(
			<div>
				<VersionMenu
					versions={versions}
					selectedVersion={versions[0] ?? null}
					canEdit
					onSelect={vi.fn()}
					onRequestDelete={vi.fn()}
					onRequestUpload={vi.fn()}
				/>
				<ViewerPresenceStrip viewers={[{ name: "Ada", avatarUrl: null }]} />
				<LoadMoreTrigger onLoadMore={vi.fn()} isLoading={false} label="Load more files" />
			</div>
		)
		expect(await accessibilityViolations(container)).toEqual([])
	})

	it("member removal buttons say who they remove", async () => {
		const { container } = render(
			<MemberList projectId="p1" members={members} canManage onMembersChanged={vi.fn()} />
		)
		expect(await accessibilityViolations(container)).toEqual([])
	})

	it("project settings switches are labelled and described", async () => {
		render(
			<ProjectSettingsModal isOpen onClose={vi.fn()} project={project} onProjectChanged={vi.fn()} />
		)
		expect(await accessibilityViolations(document.body)).toEqual([])
	})

	it("the audit log filters and table are labelled", async () => {
		const { container, findByText } = render(<AdminAuditLog />)
		await findByText(/No audit events match/)
		await waitFor(async () => expect(await accessibilityViolations(container)).toEqual([]))
	})
})
