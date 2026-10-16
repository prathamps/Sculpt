import { describe, expect, it } from "vitest"
import { auditQueryString } from "./AdminAuditLog"

const filters = {
	action: "",
	actorId: "",
	targetType: "",
	targetId: "",
	ipAddress: "",
	from: "",
	to: "",
}

describe("auditQueryString", () => {
	it("sends only the filters that were filled in", () => {
		const query = new URLSearchParams(
			auditQueryString({ ...filters, action: " media.accessed ", ipAddress: "10.0.0.1" }, 2)
		)

		expect(Object.fromEntries(query)).toEqual({
			action: "media.accessed",
			ipAddress: "10.0.0.1",
			page: "2",
			pageSize: "25",
		})
	})

	it("includes the whole of the last day in a date range", () => {
		const query = new URLSearchParams(auditQueryString({ ...filters, from: "2026-01-01", to: "2026-01-31" }))

		expect(query.get("from")).toBe("2026-01-01")
		expect(query.get("to")).toBe("2026-01-31T23:59:59.999Z")
	})
})
