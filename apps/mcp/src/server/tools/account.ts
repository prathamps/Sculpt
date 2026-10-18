import { z } from "zod"
import { defineTool } from "../tool-kit.js"

interface Profile {
	id: string
	email: string
	name: string | null
	role: string
	avatarUrl: string | null
	emailNotifications: boolean
	emailOnMention: boolean
	emailOnComment: boolean
	emailOnReply: boolean
	emailOnReview: boolean
}

const publicProfile = (profile: Profile) => ({
	id: profile.id,
	email: profile.email,
	name: profile.name,
	role: profile.role,
	avatarUrl: profile.avatarUrl,
	notificationPreferences: {
		emailNotifications: profile.emailNotifications,
		emailOnMention: profile.emailOnMention,
		emailOnComment: profile.emailOnComment,
		emailOnReply: profile.emailOnReply,
		emailOnReview: profile.emailOnReview,
	},
})

export const accountTools = [
	defineTool({
		name: "whoami",
		title: "Who am I",
		description:
			"Returns the Sculpt account this assistant acts for, and which permissions (scopes) the connection was granted. Call this first if you are unsure what you are allowed to do.",
		scope: "sculpt:read",
		effect: "read",
		input: {},
		run: async (_args, { api, caller }) => {
			const profile = await api.get<Profile>("/api/users/me")
			return {
				data: {
					...publicProfile(profile),
					connection: {
						via: caller.via,
						clientId: caller.clientId,
						grantedScopes: [...caller.scopes],
					},
				},
			}
		},
	}),
	defineTool({
		name: "update_profile",
		title: "Update display name",
		description: "Changes the display name shown to collaborators.",
		scope: "sculpt:account",
		effect: "write",
		idempotent: true,
		input: { name: z.string().trim().min(1).max(120).describe("The new display name.") },
		run: async ({ name }, { api }) => ({
			summary: `Display name changed to ${name}.`,
			data: publicProfile(await api.patch<Profile>("/api/users/me", { name })),
		}),
	}),
	defineTool({
		name: "update_notification_preferences",
		title: "Update email notification preferences",
		description:
			"Turns email notifications on or off. emailNotifications is the master switch; the others choose which events send email.",
		scope: "sculpt:account",
		effect: "write",
		idempotent: true,
		input: {
			emailNotifications: z.boolean().optional(),
			emailOnMention: z.boolean().optional(),
			emailOnComment: z.boolean().optional(),
			emailOnReply: z.boolean().optional(),
			emailOnReview: z.boolean().optional(),
		},
		run: async (preferences, { api }) => ({
			summary: "Notification preferences saved.",
			data: publicProfile(
				await api.patch<Profile>("/api/users/me/notification-preferences", preferences)
			),
		}),
	}),
]
