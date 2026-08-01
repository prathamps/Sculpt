import { z } from "zod"
import { ProjectRole } from "@prisma/client"

const MAX_PROJECT_NAME_LENGTH = 120
const MAX_SHARE_LINK_DAYS = 365
const MAX_SHARE_LINK_USES = 1000

const assignableRole = z.enum([
	ProjectRole.VIEWER,
	ProjectRole.MEMBER,
	ProjectRole.EDITOR,
])

export const createProjectSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Project name cannot be empty")
		.max(MAX_PROJECT_NAME_LENGTH),
})

export const updateProjectSchema = createProjectSchema

export const inviteMemberSchema = z.object({
	email: z.string().trim().toLowerCase().email("Enter a valid email address."),
	role: assignableRole.default(ProjectRole.MEMBER),
})

export const changeMemberRoleSchema = z.object({
	role: z.enum([
		ProjectRole.VIEWER,
		ProjectRole.MEMBER,
		ProjectRole.EDITOR,
		ProjectRole.OWNER,
	]),
})

export const createShareLinkSchema = z.object({
	role: assignableRole,
	expiresInDays: z
		.number()
		.int()
		.positive()
		.max(MAX_SHARE_LINK_DAYS)
		.nullish(),
	maxUses: z.number().int().positive().max(MAX_SHARE_LINK_USES).nullish(),
})
