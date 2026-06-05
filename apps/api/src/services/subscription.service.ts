import { prisma } from "../lib/prisma"
import { Plan, Subscription } from "@prisma/client"
import { PLAN_LIMITS, PlanLimits, PlanLimitError } from "../lib/plans"

// --- Reads / lifecycle -------------------------------------------------------

// Every user should have a Subscription row. Created lazily (on register, on
// login, or on first gated action) so existing accounts are backfilled.
export const ensureSubscription = async (
	userId: string
): Promise<Subscription> => {
	const existing = await prisma.subscription.findUnique({ where: { userId } })
	if (existing) return existing
	return prisma.subscription.create({
		data: { userId, plan: Plan.FREE, status: "active" },
	})
}

export const getUserSubscription = async (
	userId: string
): Promise<Subscription | null> => {
	return prisma.subscription.findUnique({ where: { userId } })
}

// Effective plan: PRO only counts while the subscription is active.
export const getUserPlan = async (userId: string): Promise<Plan> => {
	const sub = await prisma.subscription.findUnique({ where: { userId } })
	if (sub && sub.plan === Plan.PRO && sub.status === "active") return Plan.PRO
	return Plan.FREE
}

export const getUserLimits = async (userId: string): Promise<PlanLimits> => {
	const plan = await getUserPlan(userId)
	return PLAN_LIMITS[plan]
}

// --- Stripe sync helpers (used by the webhook) -------------------------------

export const updateSubscription = async (
	userId: string,
	data: {
		plan?: Plan
		status?: string
		provider?: string | null
		stripeCustomerId?: string | null
		stripeSubscriptionId?: string | null
		stripePriceId?: string | null
		razorpaySubscriptionId?: string | null
		currentPeriodEnd?: Date | null
		stripeCurrentPeriodEnd?: Date | null
	}
): Promise<Subscription> => {
	return prisma.subscription.upsert({
		where: { userId },
		update: data,
		create: {
			userId,
			plan: data.plan ?? Plan.FREE,
			status: data.status ?? "active",
			provider: data.provider ?? null,
			stripeCustomerId: data.stripeCustomerId ?? null,
			stripeSubscriptionId: data.stripeSubscriptionId ?? null,
			stripePriceId: data.stripePriceId ?? null,
			razorpaySubscriptionId: data.razorpaySubscriptionId ?? null,
			currentPeriodEnd: data.currentPeriodEnd ?? null,
			stripeCurrentPeriodEnd: data.stripeCurrentPeriodEnd ?? null,
		},
	})
}

export const findUserIdByStripeCustomerId = async (
	customerId: string
): Promise<string | null> => {
	const sub = await prisma.subscription.findFirst({
		where: { stripeCustomerId: customerId },
		select: { userId: true },
	})
	return sub?.userId ?? null
}

export const findUserIdByRazorpaySubscriptionId = async (
	subscriptionId: string
): Promise<string | null> => {
	const sub = await prisma.subscription.findFirst({
		where: { razorpaySubscriptionId: subscriptionId },
		select: { userId: true },
	})
	return sub?.userId ?? null
}

// --- Gating assertions -------------------------------------------------------
// Each throws PlanLimitError when the acting user's plan blocks the action.

export const assertCanCreateProject = async (userId: string): Promise<void> => {
	const limits = await getUserLimits(userId)
	if (limits.maxProjects === Infinity) return
	const ownedCount = await prisma.projectMember.count({
		where: { userId, role: "OWNER" },
	})
	if (ownedCount >= limits.maxProjects) {
		throw new PlanLimitError(
			`Your plan allows up to ${limits.maxProjects} projects. Upgrade to PRO for unlimited projects.`,
			"maxProjects"
		)
	}
}

// Member cap is governed by the project OWNER's plan (they're the one paying).
export const assertCanInviteMember = async (
	projectId: string
): Promise<void> => {
	const owner = await prisma.projectMember.findFirst({
		where: { projectId, role: "OWNER" },
		select: { userId: true },
	})
	if (!owner) return
	const limits = await getUserLimits(owner.userId)
	if (limits.maxMembersPerProject === Infinity) return
	const memberCount = await prisma.projectMember.count({ where: { projectId } })
	if (memberCount >= limits.maxMembersPerProject) {
		throw new PlanLimitError(
			`This project has reached its member limit (${limits.maxMembersPerProject}). The owner can upgrade to PRO for unlimited members.`,
			"maxMembersPerProject"
		)
	}
}

export const assertCanAddVersion = async (
	userId: string,
	currentVersionCount: number
): Promise<void> => {
	const limits = await getUserLimits(userId)
	if (limits.maxVersionsPerItem === Infinity) return
	if (currentVersionCount >= limits.maxVersionsPerItem) {
		throw new PlanLimitError(
			`Your plan allows up to ${limits.maxVersionsPerItem} versions per item. Upgrade to PRO for unlimited versions.`,
			"maxVersionsPerItem"
		)
	}
}

export const assertCanUploadVideo = async (userId: string): Promise<void> => {
	const limits = await getUserLimits(userId)
	if (!limits.canUploadVideo) {
		throw new PlanLimitError(
			"Video annotation is a PRO feature. Upgrade to PRO to upload and annotate videos.",
			"canUploadVideo"
		)
	}
}

export const assertCanExportReports = async (userId: string): Promise<void> => {
	const limits = await getUserLimits(userId)
	if (!limits.canExportReports) {
		throw new PlanLimitError(
			"Exporting reports is a PRO feature. Upgrade to PRO to export annotation reports.",
			"canExportReports"
		)
	}
}
