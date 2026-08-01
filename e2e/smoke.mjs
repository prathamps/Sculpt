import { chromium } from "playwright-core"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import {
	PNG_1PX,
	buildCubeGlb,
	buildMinimalPdf,
	buildTetrahedronStl,
} from "./fixtures.mjs"

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
	["sample-video.mkv", readFileSync(join(here, "fixtures/sample-video.mkv")), "video/x-matroska", "VIDEO"],
	["sample-image.tiff", readFileSync(join(here, "fixtures/sample-image.tiff")), "image/tiff", "IMAGE"],
]
for (const [name, bytes, mime] of fixtures) {
	uploadForm.append("images", new Blob([bytes], { type: mime }), name)
}
const uploadRes = await api(`/api/projects/${project.id}/images`, {
	method: "POST",
	body: uploadForm,
})
const uploaded = uploadRes.ok ? await uploadRes.json() : []
check(
	"upload every media type, including containers a browser cannot open",
	uploadRes.status === 201 && uploaded.length === fixtures.length,
	`status=${uploadRes.status}`
)

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
		args: [
			"--use-angle=swiftshader",
			"--enable-unsafe-swiftshader",
			"--no-sandbox",
			"--disable-dev-shm-usage",
		],
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
let navigationInFlight = false
const recordConsoleError = (message) => {
	consoleErrors.push({ message, duringNavigation: navigationInFlight })
}
page.on("console", (msg) => {
	if (msg.type() === "error") recordConsoleError(msg.text())
})
page.on("pageerror", (err) => recordConsoleError(String(err)))

const NAVIGATION_ABORT_GRACE_MS = 750

const navigate = async (url, options) => {
	navigationInFlight = true
	try {
		await page.goto(url, options)
	} finally {
		await page.waitForTimeout(NAVIGATION_ABORT_GRACE_MS)
		navigationInFlight = false
	}
}

await navigate(`${WEB}/login`, { waitUntil: "networkidle", timeout: 90000 })
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
	await navigate(`${WEB}/project/${project.id}/image/${image.id}`, {
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

let modelRefetches = 0
const countModelFetches = (request) => {
	if (/\.(glb|gltf)(\?|$)/i.test(request.url())) modelRefetches += 1
}
page.on("request", countModelFetches)
await page.click('button[aria-label^="Go to comment 1"]')
await page.waitForTimeout(2500)
page.off("request", countModelFetches)
check(
	"selecting a 3D comment flies the camera without reloading the model",
	modelRefetches === 0,
	`refetches=${modelRefetches}`
)
check(
	"the model stays on screen while the camera moves to the pin",
	await page.locator("canvas").isVisible()
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

const stlPath = join(tmpdir(), `sculpt-e2e-${stamp}.stl`)
writeFileSync(stlPath, buildTetrahedronStl())
await navigate(`${WEB}/project/${project.id}`, {
	waitUntil: "domcontentloaded",
	timeout: 120000,
})
await page.click('button:has-text("Upload")')
await page.setInputFiles("#dropzone-file", stlPath)
await page.click('button:has-text("Upload 1 file")')

const convertedVersion = await (async () => {
	const deadline = Date.now() + 90000
	while (Date.now() < deadline) {
		const res = await api(`/api/projects/${project.id}/images`)
		const images = res.ok ? await res.json() : []
		const stl = images.find((image) => image.name.endsWith(".stl"))
		if (stl?.latestVersion) return stl.latestVersion
		await new Promise((resolve) => setTimeout(resolve, 1500))
	}
	return null
})()

check("browser upload of an STL creates a version", !!convertedVersion)
check(
	"STL is stored as a MODEL",
	convertedVersion?.mediaType === "MODEL",
	`got=${convertedVersion?.mediaType}`
)
check(
	"STL was converted to a GLB proxy in the browser",
	convertedVersion?.proxyStatus === "READY" &&
		!!convertedVersion?.proxyUrl &&
		convertedVersion.proxyUrl.endsWith(".glb"),
	`status=${convertedVersion?.proxyStatus} url=${convertedVersion?.proxyUrl}`
)
check(
	"the original STL is still stored alongside the proxy",
	!!convertedVersion?.url && convertedVersion.url.endsWith(".stl"),
	`url=${convertedVersion?.url}`
)
check(
	"a 3D thumbnail was rendered for the model",
	!!convertedVersion?.thumbnailUrl,
	`thumbnailUrl=${convertedVersion?.thumbnailUrl}`
)
if (convertedVersion?.thumbnailUrl) {
	const thumbRes = await api(
		convertedVersion.thumbnailUrl.startsWith("/")
			? convertedVersion.thumbnailUrl
			: `/${convertedVersion.thumbnailUrl}`
	)
	const bytes = thumbRes.ok
		? Buffer.from(await thumbRes.arrayBuffer())
		: Buffer.alloc(0)
	check(
		"the 3D thumbnail is a transparent PNG with pixels",
		bytes.length > 1000 &&
			bytes.subarray(0, 8).equals(
				Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
			),
		`bytes=${bytes.length}`
	)
}

const renditionTargets = [
	["sample-video.mkv", "a browser-playable MP4", ".mp4"],
	["sample-image.tiff", "a browser-viewable PNG", ".png"],
]
for (const [name, description, expectedSuffix] of renditionTargets) {
	const version = byName(name).latestVersion
	const deadline = Date.now() + PROXY_READY_TIMEOUT_MS
	let ready = null
	while (Date.now() < deadline) {
		const poll = await api(`/api/images/versions/${version.id}`)
		const current = poll.ok ? await poll.json() : null
		if (current?.proxyStatus === "READY") {
			ready = current
			break
		}
		if (current?.proxyStatus === "FAILED") break
		await new Promise((resolve) => setTimeout(resolve, 2000))
	}
	check(
		`${name} is converted to ${description}`,
		!!ready?.proxyUrl && ready.proxyUrl.endsWith(expectedSuffix),
		`status=${ready?.proxyStatus} url=${ready?.proxyUrl}`
	)
}

const dracoForm = new FormData()
dracoForm.append(
	"images",
	new Blob([readFileSync(join(here, "fixtures/draco-cube.glb"))], {
		type: "model/gltf-binary",
	}),
	"draco-cube.glb"
)
const dracoRes = await api(`/api/projects/${project.id}/images`, {
	method: "POST",
	body: dracoForm,
})
const dracoImage = dracoRes.ok
	? (await dracoRes.json()).find((image) => image.name === "draco-cube.glb")
	: null
check("draco-compressed GLB uploads", !!dracoImage, `status=${dracoRes.status}`)
if (dracoImage) {
	await navigate(`${WEB}/project/${project.id}/image/${dracoImage.id}`, {
		waitUntil: "domcontentloaded",
		timeout: 120000,
	})
	await page.waitForSelector("canvas", { timeout: 90000 })
	await page.waitForTimeout(4000)
	const viewerText = await page.locator("body").innerText()
	check(
		"draco-compressed GLB renders instead of the unsupported-compression notice",
		!viewerText.includes("couldn't be loaded"),
		viewerText.slice(0, 120)
	)
}

const unsupportedPath = join(tmpdir(), `sculpt-e2e-${stamp}.heic`)
writeFileSync(unsupportedPath, Buffer.from("not really a heic"))
let uploadAttempts = 0
const countUploadAttempts = (request) => {
	if (request.url().includes("/images") && request.method() === "POST") {
		uploadAttempts++
	}
}
page.on("request", countUploadAttempts)
await navigate(`${WEB}/project/${project.id}`, {
	waitUntil: "domcontentloaded",
	timeout: 120000,
})
await page.click('button:has-text("Upload")')
await page.setInputFiles("#dropzone-file", unsupportedPath)
const namedTheFile = await page
	.waitForSelector(`text=/${stamp}\\.heic/`, { timeout: 10000 })
	.then(() => true, () => false)
check("an unsupported format is refused by name before uploading", namedTheFile)
await page.waitForTimeout(1500)
check(
	"no request is sent for a format the API would reject",
	uploadAttempts === 0,
	`attempts=${uploadAttempts}`
)
page.off("request", countUploadAttempts)


const apiSend = (method, path, body) =>
	api(path, {
		method,
		...(body === undefined
			? {}
			: {
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				}),
	})

const imageForReview = byName("sample-image.png")
const reviewVersionId = imageForReview?.latestVersion?.id

const commentRes = await apiJson(
	`/api/images/versions/${reviewVersionId}/comments`,
	{ content: "the logo needs more contrast" }
)
const createdComment = commentRes.ok ? await commentRes.json() : null
check("post a comment through the API", commentRes.status === 201 && !!createdComment?.id)

const editRes = await apiSend("PUT", `/api/images/comments/${createdComment?.id}`, {
	content: "the logo needs more contrast, especially on dark backgrounds",
})
check("edit your own comment", editRes.ok, `status=${editRes.status}`)

const likeRes = await apiJson(`/api/images/comments/${createdComment?.id}/like`, {})
const likeState = likeRes.ok ? await likeRes.json() : null
check("like a comment", likeRes.ok && likeState?.liked === true && likeState?.count === 1)

const unlikeRes = await apiJson(`/api/images/comments/${createdComment?.id}/like`, {})
const unlikeState = unlikeRes.ok ? await unlikeRes.json() : null
check(
	"liking twice toggles back off rather than erroring",
	unlikeRes.ok && unlikeState?.liked === false && unlikeState?.count === 0
)

const resolveRes = await apiJson(`/api/images/comments/${createdComment?.id}/resolve`, {})
check("resolve a comment", resolveRes.ok)

const attachmentForm = new FormData()
attachmentForm.append(
	"files",
	new Blob([PNG_1PX], { type: "image/png" }),
	"reference.png"
)
const attachRes = await api(
	`/api/images/comments/${createdComment?.id}/attachments`,
	{ method: "POST", body: attachmentForm }
)
const attachments = attachRes.ok ? await attachRes.json() : null
check(
	"attach a reference image to your own comment",
	attachRes.status === 201 &&
		attachments?.length === 1 &&
		attachments[0].fileName === "reference.png",
	`status=${attachRes.status}`
)

const attachedComments = await api(
	`/api/images/versions/${reviewVersionId}/comments`
).then((r) => (r.ok ? r.json() : []))
check(
	"attachments come back with the comment thread",
	attachedComments.find((item) => item.id === createdComment?.id)?.attachments
		?.length === 1
)

const badAttachmentForm = new FormData()
badAttachmentForm.append(
	"files",
	new Blob(["#!/bin/sh\necho pwned"], { type: "application/x-sh" }),
	"payload.sh"
)
const badAttachRes = await api(
	`/api/images/comments/${createdComment?.id}/attachments`,
	{ method: "POST", body: badAttachmentForm }
)
check(
	"an executable attachment is refused",
	badAttachRes.status >= 400,
	`status=${badAttachRes.status}`
)

const internalCommentRes = await apiJson(
	`/api/images/versions/${reviewVersionId}/comments`,
	{ content: "internal: hold this until the contract is signed", internal: true }
)
const internalComment = internalCommentRes.ok
	? await internalCommentRes.json()
	: null
check(
	"an owner can post an internal comment",
	internalCommentRes.status === 201 && internalComment?.internal === true,
	`status=${internalCommentRes.status}`
)

const ownerSeesInternal = await api(
	`/api/images/versions/${reviewVersionId}/comments`
).then((r) => (r.ok ? r.json() : []))
check(
	"the internal team sees internal comments",
	ownerSeesInternal.some((item) => item.id === internalComment?.id)
)

const emptyCommentRes = await apiJson(
	`/api/images/versions/${reviewVersionId}/comments`,
	{ content: "   " }
)
check("empty comments are rejected by validation", emptyCommentRes.status === 400, `status=${emptyCommentRes.status}`)

const changesRes = await apiJson(`/api/images/versions/${reviewVersionId}/reviews`, {
	decision: "CHANGES_REQUESTED",
	note: "contrast",
})
const changesState = changesRes.ok ? await changesRes.json() : null
check(
	"requesting changes sets the version status",
	changesRes.ok && changesState?.reviewStatus === "CHANGES_REQUESTED",
	`got=${changesState?.reviewStatus}`
)

const approveRes = await apiJson(`/api/images/versions/${reviewVersionId}/reviews`, {
	decision: "APPROVED",
})
const approveState = approveRes.ok ? await approveRes.json() : null
check(
	"changing your own decision to approved flips the status",
	approveRes.ok && approveState?.reviewStatus === "APPROVED",
	`got=${approveState?.reviewStatus}`
)

const reviewListRes = await api(`/api/images/versions/${reviewVersionId}/reviews`)
const reviewList = reviewListRes.ok ? await reviewListRes.json() : null
check(
	"one decision per reviewer, not one per submission",
	reviewListRes.ok && reviewList?.reviews?.length === 1,
	`count=${reviewList?.reviews?.length}`
)

const badDecisionRes = await apiJson(`/api/images/versions/${reviewVersionId}/reviews`, {
	decision: "LOOKS_FINE",
})
check("an unknown review decision is rejected", badDecisionRes.status === 400, `status=${badDecisionRes.status}`)

const withdrawRes = await apiSend("DELETE", `/api/images/versions/${reviewVersionId}/reviews`)
const withdrawState = withdrawRes.ok ? await withdrawRes.json() : null
check(
	"withdrawing the only decision returns the version to pending",
	withdrawRes.ok && withdrawState?.reviewStatus === "PENDING",
	`got=${withdrawState?.reviewStatus}`
)

const summaryRes = await api(`/api/projects/${project.id}/reviews/summary`)
const summary = summaryRes.ok ? await summaryRes.json() : null
check(
	"project review summary counts every version",
	summaryRes.ok && typeof summary?.PENDING === "number",
	JSON.stringify(summary)
)

const dueRes = await apiSend("PATCH", `/api/images/versions/${reviewVersionId}/due-date`, {
	dueAt: new Date(Date.now() + 86400000).toISOString(),
})
check("set a review due date", dueRes.ok, `status=${dueRes.status}`)

const searchRes = await api(`/api/search?q=${encodeURIComponent("sample-image")}`)
const searchResults = searchRes.ok ? await searchRes.json() : null
check(
	"search finds media by name",
	searchRes.ok && searchResults?.media?.some((hit) => hit.label === "sample-image.png"),
	JSON.stringify(searchResults?.media?.map((hit) => hit.label))
)

const commentSearchRes = await api(`/api/search?q=${encodeURIComponent("contrast")}`)
const commentSearch = commentSearchRes.ok ? await commentSearchRes.json() : null
check(
	"search finds comments by content",
	commentSearchRes.ok && commentSearch?.comments?.length > 0,
	`count=${commentSearch?.comments?.length}`
)

const blankSearchRes = await api("/api/search?q=")
check("a blank search term is rejected", blankSearchRes.status === 400, `status=${blankSearchRes.status}`)

const shareRes = await apiJson(`/api/projects/${project.id}/share-links`, {
	role: "VIEWER",
	expiresInDays: 7,
	maxUses: 5,
})
const shareLink = shareRes.ok ? await shareRes.json() : null
check(
	"create a share link with an expiry and a use cap",
	shareRes.status === 201 && !!shareLink?.token && shareLink?.maxUses === 5
)

const ownerShareRes = await apiJson(`/api/projects/${project.id}/share-links`, {
	role: "OWNER",
})
check("share links cannot grant OWNER", ownerShareRes.status === 400, `status=${ownerShareRes.status}`)

const ownerFollowsOwnLinkRes = await apiJson(`/api/share/${shareLink?.token}`, {})
check("following your own viewer link succeeds", ownerFollowsOwnLinkRes.ok, `status=${ownerFollowsOwnLinkRes.status}`)

const roleAfterFollow = await api(`/api/projects/${project.id}/my-role`)
const roleBody = roleAfterFollow.ok ? await roleAfterFollow.json() : null
check(
	"a share link never demotes an existing owner",
	roleBody?.role === "OWNER",
	`got=${roleBody?.role}`
)

const revokeShareRes = await apiSend(
	"DELETE",
	`/api/projects/${project.id}/share-links/${shareLink?.id}`
)
check("revoke a share link", revokeShareRes.status === 204, `status=${revokeShareRes.status}`)

const revokedFollowRes = await apiJson(`/api/share/${shareLink?.token}`, {})
check("a revoked share link stops working", revokedFollowRes.status === 404, `status=${revokedFollowRes.status}`)

const outsiderEmail = `smoke-outsider-${stamp}@example.com`
const ownerCookie = cookie
cookie = ""
await apiJson("/api/auth/register", { email: outsiderEmail, password, name: "Outsider" })
await apiJson("/api/auth/login", { email: outsiderEmail, password })
const outsiderCookie = cookie

const outsiderProjectRes = await api(`/api/projects/${project.id}`)
check(
	"a non-member cannot read someone else's project",
	outsiderProjectRes.status === 404 || outsiderProjectRes.status === 403,
	`status=${outsiderProjectRes.status}`
)

const outsiderCommentsRes = await api(`/api/images/versions/${reviewVersionId}/comments`)
check(
	"a non-member cannot read comments on it",
	outsiderCommentsRes.status === 403 || outsiderCommentsRes.status === 404,
	`status=${outsiderCommentsRes.status}`
)

const outsiderUploadForm = new FormData()
outsiderUploadForm.append(
	"images",
	new Blob([PNG_1PX], { type: "image/png" }),
	"intruder.png"
)
const outsiderUploadRes = await api(`/api/projects/${project.id}/images`, {
	method: "POST",
	body: outsiderUploadForm,
})
check(
	"a non-member is refused before any upload is accepted",
	outsiderUploadRes.status === 403 || outsiderUploadRes.status === 404,
	`status=${outsiderUploadRes.status}`
)

const outsiderReviewRes = await apiJson(
	`/api/images/versions/${reviewVersionId}/reviews`,
	{ decision: "APPROVED" }
)
check(
	"a non-member cannot approve someone else's work",
	outsiderReviewRes.status === 403 || outsiderReviewRes.status === 404,
	`status=${outsiderReviewRes.status}`
)

const outsiderSearchRes = await api(`/api/search?q=${encodeURIComponent("sample-image")}`)
const outsiderSearch = outsiderSearchRes.ok ? await outsiderSearchRes.json() : null
check(
	"search never leaks another team's media",
	outsiderSearchRes.ok &&
		(outsiderSearch?.media?.length ?? 0) === 0 &&
		(outsiderSearch?.comments?.length ?? 0) === 0,
	JSON.stringify(outsiderSearch)
)

const outsiderFolderRes = await apiJson(`/api/projects/${project.id}/folders`, {
	name: "Sneaky",
})
check(
	"a non-member cannot create folders in someone else's project",
	outsiderFolderRes.status === 403 || outsiderFolderRes.status === 404,
	`status=${outsiderFolderRes.status}`
)

const outsiderFolderListRes = await api(`/api/projects/${project.id}/folders`)
check(
	"a non-member cannot list folders",
	outsiderFolderListRes.status === 403 || outsiderFolderListRes.status === 404,
	`status=${outsiderFolderListRes.status}`
)

const outsiderMediaRes = await api(`/${imageForReview?.latestVersion?.url ?? "uploads/none"}`)
check(
	"stored media is not readable by a non-member",
	outsiderMediaRes.status === 403 || outsiderMediaRes.status === 404,
	`status=${outsiderMediaRes.status}`
)

cookie = ownerCookie

const inviteRes = await apiJson(`/api/projects/${project.id}/invite`, {
	email: outsiderEmail,
	role: "MEMBER",
})
const inviteBody = inviteRes.ok ? await inviteRes.json() : null
check(
	"inviting an existing account adds them straight away",
	inviteRes.ok && inviteBody?.invitedExistingUser === true,
	`status=${inviteRes.status}`
)

const strangerInviteRes = await apiJson(`/api/projects/${project.id}/invite`, {
	email: `nobody-${stamp}@example.com`,
	role: "VIEWER",
})
const strangerInvite = strangerInviteRes.ok ? await strangerInviteRes.json() : null
check(
	"inviting an unregistered address creates a pending invitation",
	strangerInviteRes.ok && strangerInvite?.invitedExistingUser === false
)

const pendingRes = await api(`/api/projects/${project.id}/invitations`)
const pending = pendingRes.ok ? await pendingRes.json() : []
check(
	"pending invitations are listable",
	pendingRes.ok && pending.length === 1,
	`count=${pending.length}`
)

const outsiderId = inviteBody?.project?.members?.find(
	(member) => member.user.email === outsiderEmail
)?.user?.id

cookie = outsiderCookie
const memberComments = await api(
	`/api/images/versions/${reviewVersionId}/comments`
).then((r) => (r.ok ? r.json() : []))
check(
	"a MEMBER never receives internal comments",
	!memberComments.some((item) => item.id === internalComment?.id) &&
		!memberComments.some((item) => item.internal),
	`count=${memberComments.length}`
)

const memberInternalRes = await apiJson(
	`/api/images/versions/${reviewVersionId}/comments`,
	{ content: "sneaky internal", internal: true }
)
check(
	"a MEMBER cannot post an internal comment",
	memberInternalRes.status === 403,
	`status=${memberInternalRes.status}`
)

const memberReportRes = await api(
	`/api/export/image/${imageForReview?.id}/report.json`
)
const memberReport = memberReportRes.ok ? await memberReportRes.json() : null
check(
	"an exported report hides internal comments from a MEMBER",
	memberReportRes.ok &&
		!JSON.stringify(memberReport).includes("contract is signed"),
	`status=${memberReportRes.status}`
)

const memberSearchRes = await api(
	`/api/search?q=${encodeURIComponent("contract is signed")}`
)
const memberSearch = memberSearchRes.ok ? await memberSearchRes.json() : null
check(
	"search never surfaces internal comments to a MEMBER",
	memberSearchRes.ok &&
		!memberSearch?.comments?.some((hit) => hit.id === internalComment?.id),
	JSON.stringify(memberSearch?.comments?.map((hit) => hit.label))
)
cookie = ownerCookie

const ownerSearchRes = await api(
	`/api/search?q=${encodeURIComponent("contract is signed")}`
)
const ownerSearch = ownerSearchRes.ok ? await ownerSearchRes.json() : null
check(
	"the internal team can still find internal comments",
	ownerSearchRes.ok &&
		ownerSearch?.comments?.some((hit) => hit.id === internalComment?.id),
	JSON.stringify(ownerSearch?.comments?.map((hit) => hit.label))
)

const ownerReportRes = await api(
	`/api/export/image/${imageForReview?.id}/report.json`
)
const ownerReport = ownerReportRes.ok ? await ownerReportRes.json() : null
check(
	"the internal team's export still contains internal comments",
	ownerReportRes.ok &&
		JSON.stringify(ownerReport).includes("contract is signed"),
	`status=${ownerReportRes.status}`
)

const typeFilterRes = await api(
	`/api/search?q=${encodeURIComponent("sample")}&mediaType=VIDEO`
)
const typeFiltered = typeFilterRes.ok ? await typeFilterRes.json() : null
check(
	"a media-type filter returns only that type and drops project hits",
	typeFilterRes.ok &&
		typeFiltered.media.length > 0 &&
		typeFiltered.media.every((hit) => hit.mediaType === "VIDEO") &&
		typeFiltered.projects.length === 0,
	JSON.stringify(typeFiltered?.media?.map((hit) => hit.mediaType))
)

const badFilterRes = await api(
	`/api/search?q=${encodeURIComponent("sample")}&mediaType=HOLOGRAM`
)
check(
	"an unknown media-type filter is rejected",
	badFilterRes.status === 400,
	`status=${badFilterRes.status}`
)

const roleChangeRes = await apiSend(
	"PATCH",
	`/api/projects/${project.id}/members/${outsiderId}/role`,
	{ role: "EDITOR" }
)
check("an owner can change a member's role", roleChangeRes.ok, `status=${roleChangeRes.status}`)

const selfDemoteRes = await apiSend(
	"PATCH",
	`/api/projects/${project.id}/members/${outsiderId}/role`,
	{ role: "SUPREME_LEADER" }
)
check("an invalid role is rejected", selfDemoteRes.status === 400, `status=${selfDemoteRes.status}`)

cookie = outsiderCookie
const memberMediaRes = await api(`/${imageForReview?.latestVersion?.url ?? "uploads/none"}`)
check(
	"stored media becomes readable once you are a member",
	memberMediaRes.ok,
	`status=${memberMediaRes.status}`
)

const editorComments = await api(
	`/api/images/versions/${reviewVersionId}/comments`
).then((r) => (r.ok ? r.json() : []))
check(
	"promotion to EDITOR reveals internal comments",
	editorComments.some((item) => item.id === internalComment?.id),
	`count=${editorComments.length}`
)
cookie = ownerCookie

const folderRes = await apiJson(`/api/projects/${project.id}/folders`, {
	name: "Shots",
})
const folder = folderRes.ok ? await folderRes.json() : null
check("create a folder", folderRes.status === 201 && !!folder?.id)

const nestedRes = await apiJson(`/api/projects/${project.id}/folders`, {
	name: "Approved",
	parentId: folder?.id,
})
const nested = nestedRes.ok ? await nestedRes.json() : null
check("create a nested folder", nestedRes.status === 201 && !!nested?.id)

const duplicateRes = await apiJson(`/api/projects/${project.id}/folders`, {
	name: "Shots",
})
check(
	"a duplicate folder name in the same parent is refused",
	duplicateRes.status === 400,
	`status=${duplicateRes.status}`
)

const cycleRes = await apiSend(
	"PATCH",
	`/api/projects/${project.id}/folders/${folder?.id}/parent`,
	{ parentId: nested?.id }
)
check(
	"a folder cannot be moved inside its own descendant",
	cycleRes.status === 400,
	`status=${cycleRes.status}`
)

const moveImageRes = await apiSend(
	"PATCH",
	`/api/projects/${project.id}/images/${imageForReview?.id}/folder`,
	{ folderId: folder?.id }
)
check("move a file into a folder", moveImageRes.status === 204, `status=${moveImageRes.status}`)

const inFolderRes = await api(
	`/api/projects/${project.id}/images?folderId=${folder?.id}`
)
const inFolder = inFolderRes.ok ? await inFolderRes.json() : []
check(
	"listing a folder returns only its files",
	inFolderRes.ok &&
		inFolder.length === 1 &&
		inFolder[0].id === imageForReview?.id,
	`count=${inFolder.length}`
)

const rootListRes = await api(`/api/projects/${project.id}/images?folderId=root`)
const rootList = rootListRes.ok ? await rootListRes.json() : []
check(
	"the root listing excludes files that moved into a folder",
	rootListRes.ok && !rootList.some((item) => item.id === imageForReview?.id),
	`count=${rootList.length}`
)

const bulkMoveRes = await apiSend(
	"PATCH",
	`/api/projects/${project.id}/images/folder`,
	{ imageIds: [imageForReview?.id], folderId: nested?.id }
)
check(
	"move several files at once",
	bulkMoveRes.ok && (await bulkMoveRes.json())?.moved === 1,
	`status=${bulkMoveRes.status}`
)

const bulkMoveStolenRes = await apiSend(
	"PATCH",
	`/api/projects/${project.id}/images/folder`,
	{ imageIds: [imageForReview?.id, "not-a-real-image"], folderId: null }
)
check(
	"a bulk move that names an unknown file moves nothing",
	bulkMoveStolenRes.status === 404,
	`status=${bulkMoveStolenRes.status}`
)

const stillNested = await api(
	`/api/projects/${project.id}/images?folderId=${nested?.id}`
).then((r) => (r.ok ? r.json() : []))
check(
	"the rejected bulk move left the files where they were",
	stillNested.some((item) => item.id === imageForReview?.id),
	`count=${stillNested.length}`
)

await apiSend("PATCH", `/api/projects/${project.id}/images/folder`, {
	imageIds: [imageForReview?.id],
	folderId: folder?.id,
})

const foldersListRes = await api(`/api/projects/${project.id}/folders`)
const foldersList = foldersListRes.ok ? await foldersListRes.json() : []
check(
	"folders report how many files they hold",
	foldersListRes.ok &&
		foldersList.find((item) => item.id === folder?.id)?.imageCount === 1,
	JSON.stringify(foldersList)
)

const downloadRes = await api(
	`/api/images/versions/${reviewVersionId}/download`,
	{ redirect: "manual" }
)
check(
	"a member can download the original file",
	(downloadRes.status === 200 &&
		(downloadRes.headers.get("content-disposition") ?? "").includes(
			"attachment"
		)) ||
		downloadRes.status === 302,
	`status=${downloadRes.status}`
)

const membersRes = await api(`/api/projects/${project.id}/members`)
const membersList = membersRes.ok ? await membersRes.json() : []
check(
	"project members are listable for the mention picker",
	membersRes.ok && membersList.length === 2,
	`count=${membersList.length}`
)

const mentionCommentRes = await apiJson(
	`/api/images/versions/${reviewVersionId}/comments`,
	{
		content: "@Outsider please take a look",
		mentionedUserIds: [outsiderId, "not-a-member-id"],
	}
)
const mentionComment = mentionCommentRes.ok ? await mentionCommentRes.json() : null
check(
	"mentioning a member stores the mention and drops non-members",
	mentionCommentRes.status === 201 &&
		mentionComment?.mentions?.length === 1 &&
		mentionComment?.mentions?.[0]?.userId === outsiderId,
	JSON.stringify(mentionComment?.mentions)
)

cookie = outsiderCookie
const mentionFeedRes = await api("/api/notifications")
const mentionFeed = mentionFeedRes.ok ? await mentionFeedRes.json() : null
check(
	"the mentioned member is notified",
	mentionFeedRes.ok &&
		mentionFeed?.notifications?.some(
			(item) =>
				item.metadata?.type === "mention" &&
				item.content.includes("mentioned you")
		),
	JSON.stringify(mentionFeed?.notifications?.slice(0, 3))
)
cookie = ownerCookie

const prefsRes = await apiSend(
	"PATCH",
	"/api/users/me/notification-preferences",
	{ emailOnMention: false }
)
const prefs = prefsRes.ok ? await prefsRes.json() : null
check(
	"turning off one email type leaves the others alone",
	prefsRes.ok &&
		prefs?.emailOnMention === false &&
		prefs?.emailOnComment === true &&
		prefs?.emailNotifications === true,
	JSON.stringify(prefs)
)

const emptyPrefsRes = await apiSend(
	"PATCH",
	"/api/users/me/notification-preferences",
	{}
)
check(
	"an empty preference update is rejected",
	emptyPrefsRes.status === 400,
	`status=${emptyPrefsRes.status}`
)

const meAfterPrefs = await api("/api/users/me").then((r) =>
	r.ok ? r.json() : null
)
check(
	"the profile reports the saved preferences",
	meAfterPrefs?.emailOnMention === false,
	JSON.stringify(meAfterPrefs?.emailOnMention)
)

await apiSend("PATCH", "/api/users/me/notification-preferences", {
	emailOnMention: true,
})

const resetRequestRes = await apiJson("/api/auth/password-reset/request", {
	email,
})
check(
	"a password reset request is always accepted without leaking whether the account exists",
	resetRequestRes.status === 202,
	`status=${resetRequestRes.status}`
)

const unknownResetRes = await apiJson("/api/auth/password-reset/request", {
	email: `definitely-not-a-user-${stamp}@example.com`,
})
check(
	"an unknown address gets the same answer",
	unknownResetRes.status === 202,
	`status=${unknownResetRes.status}`
)

const badResetRes = await apiJson("/api/auth/password-reset/complete", {
	token: "not-a-real-token",
	password: "another-Password-1",
})
check("a forged reset token is refused", badResetRes.status === 400, `status=${badResetRes.status}`)

const shortPasswordRes = await apiJson("/api/auth/register", {
	email: `short-${stamp}@example.com`,
	password: "x",
})
check(
	"registration enforces the same password policy as changing one",
	shortPasswordRes.status === 400,
	`status=${shortPasswordRes.status}`
)

const healthBody = await (await api("/health")).json()
check(
	"health reports component status",
	healthBody?.components?.database === "ok",
	JSON.stringify(healthBody)
)

const deleteRes = await api(`/api/projects/${project.id}`, { method: "DELETE" })
check("cleanup deletes the project", deleteRes.status === 200 || deleteRes.status === 204, `status=${deleteRes.status}`)

const EXPECTED_BEFORE_LOGIN = /status of 401/
const REQUEST_ABORTED = /Failed to fetch|NetworkError|Load failed|ERR_ABORTED/i

const ignorable = ({ message, duringNavigation }) =>
	message.includes("favicon") ||
	EXPECTED_BEFORE_LOGIN.test(message) ||
	(duringNavigation && REQUEST_ABORTED.test(message))

const unexpectedErrors = consoleErrors.filter((entry) => !ignorable(entry))
const abortsIgnored = consoleErrors.filter(
	(entry) => entry.duringNavigation && REQUEST_ABORTED.test(entry.message)
)
if (abortsIgnored.length) {
	console.log(
		`  (ignored ${abortsIgnored.length} request(s) aborted by test navigation)`
	)
}
check("no unexpected browser console errors", unexpectedErrors.length === 0)
unexpectedErrors
	.slice(0, 10)
	.forEach(({ message }) => console.log("  ERR:", message.slice(0, 200)))

await browser.close()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
	console.log(failures.map((name) => ` - ${name}`).join("\n"))
	process.exit(1)
}
