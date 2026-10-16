import { describe, expect, it, afterEach } from "vitest"
import { ValidationError } from "../../lib/errors"
import { shareLinkExpiryDays } from "./share-link-policy"

afterEach(() => {
	delete process.env.SHARE_LINK_MAX_DAYS
	delete process.env.SHARE_LINK_DEFAULT_EXPIRY_DAYS
})

describe("shareLinkExpiryDays", () => {
	it("expires links after seven days unless asked otherwise", () => {
		expect(shareLinkExpiryDays(undefined)).toBe(7)
	})

	it("honours an explicit request for a link that never expires", () => {
		expect(shareLinkExpiryDays(null)).toBeNull()
	})

	it("refuses never-expiring links once an operator sets a maximum", () => {
		process.env.SHARE_LINK_MAX_DAYS = "30"

		expect(() => shareLinkExpiryDays(null)).toThrow(ValidationError)
		expect(() => shareLinkExpiryDays(31)).toThrow(/30 days/)
		expect(shareLinkExpiryDays(30)).toBe(30)
	})

	it("keeps the default inside the operator's maximum", () => {
		process.env.SHARE_LINK_DEFAULT_EXPIRY_DAYS = "14"
		process.env.SHARE_LINK_MAX_DAYS = "3"

		expect(shareLinkExpiryDays(undefined)).toBe(3)
	})
})
