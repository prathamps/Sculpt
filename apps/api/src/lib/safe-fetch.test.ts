import { describe, expect, it } from "vitest"
import { fetchPublicJson } from "./safe-fetch"
import { isPrivateAddress } from "./address-policy"

describe("isPrivateAddress", () => {
	it("blocks loopback, private, link-local and metadata addresses", () => {
		for (const address of [
			"127.0.0.1",
			"10.1.2.3",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"0.0.0.0",
			"::1",
			"::",
			"fc00::1",
			"fd12:3456::1",
			"fe80::1",
		]) {
			expect(isPrivateAddress(address), address).toBe(true)
		}
	})

	it("blocks IPv4-mapped IPv6 forms of private addresses", () => {
		expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true)
		expect(isPrivateAddress("::ffff:7f00:1")).toBe(true)
		expect(isPrivateAddress("::ffff:a9fe:a9fe")).toBe(true)
	})

	it("allows public addresses", () => {
		for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) {
			expect(isPrivateAddress(address), address).toBe(false)
		}
	})

	it("treats anything that is not an IP as unsafe", () => {
		expect(isPrivateAddress("localhost")).toBe(true)
	})
})

describe("fetchPublicJson", () => {
	it("refuses plain http unless private networks are explicitly allowed", async () => {
		await expect(fetchPublicJson("http://example.com/client.json")).rejects.toThrow(
			"Only https URLs can be fetched"
		)
	})

	it("refuses hosts that resolve to loopback", async () => {
		await expect(fetchPublicJson("https://127.0.0.1/client.json")).rejects.toThrow(
			/non-public address/
		)
	})
})
