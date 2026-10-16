import { ProjectRole } from "@/types"
import { roleAtLeast } from "./utils"

export interface ContentPolicy {
	allowDownloads: boolean
	watermarkViewers: boolean
}

export const OPEN_CONTENT_POLICY: ContentPolicy = {
	allowDownloads: true,
	watermarkViewers: false,
}

export const mayDownloadOriginals = (
	policy: ContentPolicy,
	role: ProjectRole | null
): boolean =>
	roleAtLeast(role, "VIEWER") && (policy.allowDownloads || roleAtLeast(role, "EDITOR"))
