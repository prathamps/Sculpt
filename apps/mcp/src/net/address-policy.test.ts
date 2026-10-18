import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { isPrivateAddress } from "./address-policy.js"

const PRIVATE = [
	"10.1.2.3",
	"127.0.0.1",
	"169.254.169.254",
	"192.168.1.1",
	"100.64.0.1",
	"192.0.2.10",
	"198.51.100.7",
	"203.0.113.9",
	"::1",
	"fd00::1",
	"fe80::1",
	"::ffff:127.0.0.1",
	"::ffff:7f00:1",
	"64:ff9b::a00:1",
	"64:ff9b::10.0.0.1",
	"::127.0.0.1",
	"2001:db8::1",
	"[::1]",
	"localhost",
]

const PUBLIC = ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "64:ff9b::808:808"]

describe("isPrivateAddress", () => {
	it.each(PRIVATE)("refuses %s", (address) => {
		expect(isPrivateAddress(address)).toBe(true)
	})

	it.each(PUBLIC)("allows %s", (address) => {
		expect(isPrivateAddress(address)).toBe(false)
	})
})

describe("address policy", () => {
	it("stays identical to the API's copy so both services refuse the same addresses", () => {
		const here = fileURLToPath(new URL("./address-policy.ts", import.meta.url))
		const api = fileURLToPath(new URL("../../../api/src/lib/address-policy.ts", import.meta.url))
		const normalized = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n")

		expect(normalized(here)).toBe(normalized(api))
	})
})
