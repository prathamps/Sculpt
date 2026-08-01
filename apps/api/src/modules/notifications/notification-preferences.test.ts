import { describe, expect, it } from "vitest"
import { EmailPreferences, wantsEmailFor } from "./notification-preferences"

const allOn: EmailPreferences = {
	emailNotifications: true,
	emailOnMention: true,
	emailOnComment: true,
	emailOnReply: true,
	emailOnReview: true,
}

describe("wantsEmailFor", () => {
	it("sends nothing when the master switch is off", () => {
		expect(
			wantsEmailFor({ ...allOn, emailNotifications: false }, { type: "mention" })
		).toBe(false)
	})

	it("honours the per-type switch", () => {
		const noMentions = { ...allOn, emailOnMention: false }
		expect(wantsEmailFor(noMentions, { type: "mention" })).toBe(false)
		expect(wantsEmailFor(noMentions, { type: "new_comment" })).toBe(true)
	})

	it("treats likes as comment activity", () => {
		expect(
			wantsEmailFor({ ...allOn, emailOnComment: false }, { type: "like" })
		).toBe(false)
	})

	it("silences review decisions when that switch is off", () => {
		const noReviews = { ...allOn, emailOnReview: false }
		expect(wantsEmailFor(noReviews, { type: "review" })).toBe(false)
		expect(wantsEmailFor(allOn, { type: "review" })).toBe(true)
	})

	it("still emails replies when only comment activity is muted", () => {
		expect(
			wantsEmailFor({ ...allOn, emailOnComment: false }, { type: "comment_reply" })
		).toBe(true)
	})

	it("sends unrecognised or untyped notifications rather than dropping them", () => {
		expect(wantsEmailFor(allOn, { type: "something_new" })).toBe(true)
		expect(wantsEmailFor(allOn, undefined)).toBe(true)
		expect(wantsEmailFor(allOn, { nested: { type: "mention" } })).toBe(true)
	})
})
