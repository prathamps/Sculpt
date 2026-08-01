import { describe, expect, it } from "vitest"
import { deriveReviewStatus } from "./reviews.service"

describe("deriveReviewStatus", () => {
	it("is pending when nobody has decided", () => {
		expect(deriveReviewStatus([])).toBe("PENDING")
	})

	it("is approved when the only decisions are approvals", () => {
		expect(deriveReviewStatus(["APPROVED"])).toBe("APPROVED")
		expect(deriveReviewStatus(["APPROVED", "APPROVED"])).toBe("APPROVED")
	})

	it("lets a single changes-requested outweigh any number of approvals", () => {
		expect(
			deriveReviewStatus(["APPROVED", "APPROVED", "CHANGES_REQUESTED"])
		).toBe("CHANGES_REQUESTED")
	})

	it("is changes-requested when that is the only decision", () => {
		expect(deriveReviewStatus(["CHANGES_REQUESTED"])).toBe("CHANGES_REQUESTED")
	})
})
