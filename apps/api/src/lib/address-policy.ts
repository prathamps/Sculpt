import net from "net"

const IPV4_BLOCKED_RANGES: [string, number][] = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
]

const IPV4_EMBEDDING_PREFIXES = ["::ffff:", "64:ff9b:", "::"]

const ipv4ToNumber = (address: string): number =>
	address.split(".").reduce((total, octet) => total * 256 + Number(octet), 0)

const inIpv4Range = (address: string, [base, bits]: [string, number]): boolean => {
	const size = 2 ** (32 - bits)
	const start = ipv4ToNumber(base)
	const value = ipv4ToNumber(address)
	return value >= start && value < start + size
}

const isBlockedIpv4 = (address: string): boolean =>
	IPV4_BLOCKED_RANGES.some((range) => inIpv4Range(address, range))

const hexPairToIpv4 = (high: string, low: string): string => {
	const value = (parseInt(high, 16) << 16) | parseInt(low, 16)
	return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".")
}

const embeddedIpv4 = (address: string): string | null => {
	const dotted = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)
	if (dotted) return dotted[1] ?? null
	const hex = /:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address)
	return hex ? hexPairToIpv4(hex[1] ?? "0", hex[2] ?? "0") : null
}

const embedsIpv4 = (address: string): boolean =>
	IPV4_EMBEDDING_PREFIXES.some((prefix) => address.startsWith(prefix))

const isBlockedIpv6 = (address: string): boolean => {
	if (address === "::" || address === "::1") return true
	const embedded = embeddedIpv4(address)
	if (embedded && embedsIpv4(address)) return isBlockedIpv4(embedded)
	const firstHextet = parseInt(address.split(":")[0] || "0", 16)
	if ((firstHextet & 0xfe00) === 0xfc00) return true
	if ((firstHextet & 0xffc0) === 0xfe80) return true
	if ((firstHextet & 0xff00) === 0xff00) return true
	return address.startsWith("2001:db8:") || address.startsWith("2001:0db8:")
}

export const withoutBrackets = (host: string): string => host.replace(/^\[|\]$/g, "")

export const isPrivateAddress = (raw: string): boolean => {
	const address = withoutBrackets(raw.toLowerCase())
	const family = net.isIP(address)
	if (family === 4) return isBlockedIpv4(address)
	if (family === 6) return isBlockedIpv6(address)
	return true
}
