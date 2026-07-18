import { chromium } from "playwright-core"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { PNG_1PX, buildCubeGlb, buildMinimalPdf } from "./fixtures.mjs"

const API = process.env.SCULPT_API_URL || "http://localhost:3001"
const WEB = process.env.SCULPT_WEB_URL || "http://localhost:3000"
const PROXY_READY_TIMEOUT_MS = 180000

const stamp = Date.now()
const email = `smoke-${stamp}@example.com`
const password = "smoke-Password-1"

let passed = 0
const failures = []
const check = (name, condition, detail = "") => {
	if (condition) {
		passed++
		console.log(`  ok  ${name}`)
	} else {
		failures.push(name)
		console.log(`FAIL  ${name} ${detail}`)
	}
}
const fatal = (message) => {
	console.error(`FATAL ${message}`)
	process.exit(1)
}

let cookie = ""
const api = async (path, opts = {}) => {
	const res = await fetch(`${API}${path}`, {
		...opts,
		headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
	})
	const setCookies = res.headers.getSetCookie?.() ?? []
	if (setCookies.length) {
		cookie = setCookies.map((c) => c.split(";")[0]).join("; ")
	}
	return res
}
const apiJson = (path, body) =>
	api(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	})

const health = await api("/health").catch(() => null)
if (!health?.ok) fatal(`API is not reachable at ${API}`)
const webRoot = await fetch(WEB).catch(() => null)
if (!webRoot?.ok) fatal(`Web app is not reachable at ${WEB}`)

check("register user", (await apiJson("/api/auth/register", { email, password, name: "Smoke" })).status === 201)
check("login via API sets cookie", (await apiJson("/api/auth/login", { email, password })).ok && cookie.length > 0)

const projectRes = await apiJson("/api/projects", { name: `Smoke ${stamp}` })
const project = await projectRes.json()
check("create project", projectRes.ok && !!project.id)

const here = dirname(fileURLToPath(import.meta.url))
const uploadForm = new FormData()
const fixtures = [
	["sample-image.png", PNG_1PX, "image/png", "IMAGE"],
	["sample-video.mp4", readFileSync(join(here, "fixtures/sample-video.mp4")), "video/mp4", "VIDEO"],
	["sample-doc.pdf", buildMinimalPdf(), "application/pdf", "PDF"],
	["sample-model.glb", buildCubeGlb(), "model/gltf-binary", "MODEL"],
]
for (const [name, bytes, mime] of fixtures) {
	uploadForm.append("images", new Blob([bytes], { type: mime }), name)
}
const uploadRes = await api(`/api/projects/${project.id}/images`, {
	method: "POST",
	body: uploadForm,
})
const uploaded = uploadRes.ok ? await uploadRes.json() : []
check("upload all four media types", uploadRes.status === 201 && uploaded.length === 4, `status=${uploadRes.status}`)

const byName = (name) => uploaded.find((image) => image.name === name)
for (const [name, , , expectedType] of fixtures) {
	check(
		`${name} stored as ${expectedType}`,
		byName(name)?.latestVersion?.mediaType === expectedType,
		`got=${byName(name)?.latestVersion?.mediaType}`
	)
}
check(
	"video version enters the proxy pipeline",
	["PENDING", "READY"].includes(byName("sample-video.mp4")?.latestVersion?.proxyStatus),
	`got=${byName("sample-video.mp4")?.latestVersion?.proxyStatus}`
)

const launchSystemBrowser = async () => {
	const options = {
		headless: true,
		args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	}
	try {
		return await chromium.launch({ ...options, channel: "chrome" })
	} catch {
		return chromium.launch({ ...options, channel: "msedge" })
	}
}

const browser = await launchSystemBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const consoleErrors = []
page.on("console", (msg) => {
	if (msg.type() === "error") consoleErrors.push(msg.text())
})
page.on("pageerror", (err) => consoleErrors.push(String(err)))

await page.goto(`${WEB}/login`, { waitUntil: "networkidle", timeout: 90000 })
await page.fill("#email", email)
await page.fill("#password", password)
let loggedIn = false
for (let attempt = 0; attempt < 3 && !loggedIn; attempt++) {
	const loginFired = page
		.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 5000 })
		.catch(() => null)
	await page.click('button[type="submit"]')
	if (await loginFired) {
		loggedIn = await page
			.waitForURL("**/dashboard**", { timeout: 30000 })
			.then(() => true, () => false)
	}
}
check("UI login reaches dashboard", loggedIn)
if (!loggedIn) fatal("cannot continue without a session")

const openViewer = async (imageName) => {
	const image = byName(imageName)
	await page.goto(`${WEB}/project/${project.id}/image/${image.id}`, {
		waitUntil: "domcontentloaded",
		timeout: 120000,
	})
	return image
}

await openViewer("sample-image.png")
check(
	"image viewer renders a canvas",
	await page.waitForSelector("canvas", { timeout: 60000 }).then(() => true, () => false)
)
await page.fill("#comment-input", "smoke comment on image")
await page.click('button[aria-label="Send comment"]')
check(
	"image comment appears in the sidebar",
	await page.waitForSelector("text=smoke comment on image", { timeout: 15000 }).then(() => true, () => false)
)

await openViewer("sample-doc.pdf")
check(
	"pdf viewer renders a canvas",
	await page.waitForSelector("canvas", { timeout: 60000 }).then(() => true, () => false)
)

const model = await openViewer("sample-model.glb")
check(
	"3D viewer renders a canvas",
	await page.waitForSelector("canvas", { timeout: 90000 }).then(() => true, () => false)
)
await page.waitForTimeout(2000)
const canvasBox = await page.locator("canvas").boundingBox()
await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
check(
	"clicking the model places a pending pin",
	await page.waitForSelector("text=Pin placed on model", { timeout: 10000 }).then(() => true, () => false)
)
await page.fill("#comment-input", "smoke pin comment")
await page.click('button[aria-label="Send comment"]')
check(
	"pinned comment renders a numbered pin",
	await page.waitForSelector('button[aria-label^="Go to comment 1"]', { timeout: 15000 }).then(() => true, () => false)
)
const pinComments = await api(`/api/images/versions/${model.latestVersion.id}/comments`).then((r) => r.json())
check(
	"pinned comment persisted its 3D anchor",
	pinComments.some((c) => c.modelAnchor?.position?.length === 3)
)

const video = await openViewer("sample-video.mp4")
check(
	"video viewer renders a player",
	await page.waitForSelector("video", { timeout: 60000 }).then(() => true, () => false)
)
const proxyDeadline = Date.now() + PROXY_READY_TIMEOUT_MS
let readyVersion = null
while (Date.now() < proxyDeadline) {
	const res = await api(`/api/images/versions/${video.latestVersion.id}`)
	const version = res.ok ? await res.json() : null
	if (version?.proxyStatus === "READY") {
		readyVersion = version
		break
	}
	if (version?.proxyStatus === "FAILED") break
	await new Promise((resolve) => setTimeout(resolve, 2000))
}
check("video proxy transcodes to READY", !!readyVersion, "status never reached READY")
check("proxy rendition stored", !!readyVersion?.proxyUrl, JSON.stringify(readyVersion))
check(
	"server probed the real duration",
	typeof readyVersion?.duration === "number" && readyVersion.duration > 1,
	`duration=${readyVersion?.duration}`
)
check("server generated a poster thumbnail", !!readyVersion?.thumbnailUrl)
if (readyVersion?.proxyUrl) {
	const proxyBasename = readyVersion.proxyUrl.split("/").pop()
	check(
		"player switches to the proxy rendition",
		await page
			.waitForSelector(`video[src*="${proxyBasename}"]`, { timeout: 30000 })
			.then(() => true, () => false)
	)
}

const deleteRes = await api(`/api/projects/${project.id}`, { method: "DELETE" })
check("cleanup deletes the project", deleteRes.status === 200 || deleteRes.status === 204, `status=${deleteRes.status}`)

const unexpectedErrors = consoleErrors.filter(
	(message) =>
		!message.includes("status of 401") && !message.includes("favicon")
)
check("no unexpected browser console errors", unexpectedErrors.length === 0)
unexpectedErrors.slice(0, 10).forEach((message) => console.log("  ERR:", message.slice(0, 200)))

await browser.close()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
	console.log(failures.map((name) => ` - ${name}`).join("\n"))
	process.exit(1)
}
