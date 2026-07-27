import { describe, expect, it } from "vitest"
import { escapeHtml } from "./email.service"

describe("escapeHtml", () => {
	it("neutralises a script tag smuggled through a display name", () => {
		expect(escapeHtml('<script>alert("x")</script>')).toBe(
			"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
		)
	})

	it("neutralises an injected anchor used for phishing", () => {
		expect(escapeHtml('<a href="http://evil.test">Reset</a>')).toBe(
			"&lt;a href=&quot;http://evil.test&quot;&gt;Reset&lt;/a&gt;"
		)
	})

	it("escapes ampersands before other entities so output is not double-broken", () => {
		expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry")
	})

	it("escapes single quotes that could break out of an attribute", () => {
		expect(escapeHtml("it's")).toBe("it&#39;s")
	})

	it("leaves ordinary text untouched", () => {
		expect(escapeHtml("Ada Lovelace")).toBe("Ada Lovelace")
	})
})
