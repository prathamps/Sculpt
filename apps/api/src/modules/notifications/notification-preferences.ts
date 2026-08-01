export interface EmailPreferences {
	emailNotifications: boolean
	emailOnMention: boolean
	emailOnComment: boolean
	emailOnReply: boolean
	emailOnReview: boolean
}

export const NOTIFICATION_PREFERENCE_KEYS = [
	"emailNotifications",
	"emailOnMention",
	"emailOnComment",
	"emailOnReply",
	"emailOnReview",
] as const

const PREFERENCE_FOR_TYPE: Record<string, keyof EmailPreferences> = {
	mention: "emailOnMention",
	new_comment: "emailOnComment",
	like: "emailOnComment",
	comment_reply: "emailOnReply",
	review: "emailOnReview",
}

const notificationTypeOf = (metadata: unknown): string | null => {
	if (typeof metadata !== "object" || metadata === null) return null
	const type = (metadata as { type?: unknown }).type
	return typeof type === "string" ? type : null
}

export const wantsEmailFor = (
	preferences: EmailPreferences,
	metadata: unknown
): boolean => {
	if (!preferences.emailNotifications) return false

	const type = notificationTypeOf(metadata)
	if (!type) return true

	const key = PREFERENCE_FOR_TYPE[type]
	return key ? preferences[key] : true
}
