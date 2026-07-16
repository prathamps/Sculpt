import { Plan } from "@prisma/client"

// Centralised definition of what each subscription tier unlocks.
// FREE is intentionally limited; PRO removes the caps and unlocks
// video annotation + report export.
export interface PlanLimits {
	maxProjects: number
	maxMembersPerProject: number // includes the owner
	maxVersionsPerItem: number
	canUploadVideo: boolean
	canExportReports: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
	FREE: {
		maxProjects: 3,
		maxMembersPerProject: 3,
		maxVersionsPerItem: 2,
		canUploadVideo: false,
		canExportReports: false,
	},
	PRO: {
		maxProjects: Infinity,
		maxMembersPerProject: Infinity,
		maxVersionsPerItem: Infinity,
		canUploadVideo: true,
		canExportReports: true,
	},
}

export const getPlanLimits = (plan: Plan): PlanLimits => PLAN_LIMITS[plan]

// Error thrown when an action is blocked by the user's plan. Controllers
// translate this into an HTTP 402 (Payment Required) with an upgrade hint.
export class PlanLimitError extends Error {
	public readonly code = "PLAN_LIMIT"
	constructor(message: string, public readonly limit?: keyof PlanLimits) {
		super(message)
		this.name = "PlanLimitError"
	}
}
