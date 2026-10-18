import fs from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"
import { uploadsDir } from "../../storage"
import { AppError, NotFoundError, ValidationError } from "../../lib/errors"
import { logger } from "../../lib/logger"
import { fileMatchesDeclaredMime } from "../../middleware/file-signature"
import {
	isAllowedMime,
	maxUploadMb,
	oversizedUploadMessage,
	stagedUploadPath,
} from "../../middleware/upload.middleware"

export const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024
export const MAX_OPEN_UPLOADS_PER_USER = 20
export const MAX_CHUNKS_IN_FLIGHT_PER_USER = 3
const SESSION_IDLE_LIMIT_MS = 24 * 3600000
const STALE_CLAIM_MS = 15 * 60000
const MB = 1024 * 1024
const UPLOAD_LIMITS_PER_QUOTA = 4

export const openUploadQuotaBytes = (): number => {
	const configured = Number(process.env.RESUMABLE_QUOTA_MB)
	return (Number.isFinite(configured) && configured > 0
		? configured
		: maxUploadMb * UPLOAD_LIMITS_PER_QUOTA) * MB
}
const MAX_FILE_NAME_LENGTH = 255
const SESSION_ID_PATTERN = /^[a-f0-9]{32}$/

export const resumableDir = path.join(uploadsDir, ".staging", "resumable")

export interface ResumableUpload {
	id: string
	userId: string
	projectId: string
	fileName: string
	mimeType: string
	size: number
	received: number
	createdAt: string
	updatedAt: string
	claimedAt?: string | null
}

export interface StartUpload {
	userId: string
	projectId: string
	fileName: string
	mimeType: string
	size: number
}

export class TooManyUploadsError extends AppError {
	constructor() {
		super(
			`You already have ${MAX_OPEN_UPLOADS_PER_USER} unfinished uploads. Finish or cancel some first.`,
			429
		)
	}
}

export class UploadQuotaError extends AppError {
	constructor() {
		super(
			"Your unfinished uploads already take up all the space allowed. Finish or cancel some first.",
			429
		)
	}
}

export class OffsetMismatchError extends AppError {
	constructor(readonly expectedOffset: number) {
		super("The upload has moved on. Resume from the offset the server reports.", 409)
	}
}

const sessionDir = (id: string): string => {
	if (!SESSION_ID_PATTERN.test(id)) throw new NotFoundError("Upload not found")
	return path.join(resumableDir, id)
}

const metaPath = (id: string) => path.join(sessionDir(id), "session.json")
const dataPath = (id: string) => path.join(sessionDir(id), "data")

const readSession = async (id: string): Promise<ResumableUpload | null> => {
	try {
		return JSON.parse(await fs.readFile(metaPath(id), "utf8")) as ResumableUpload
	} catch (error) {
		if (error instanceof NotFoundError) throw error
		return null
	}
}

const writeSession = async (session: ResumableUpload): Promise<void> => {
	const target = metaPath(session.id)
	const temporary = `${target}.${randomBytes(4).toString("hex")}.tmp`
	await fs.writeFile(temporary, JSON.stringify(session))
	await fs.rename(temporary, target)
}

const listSessionIds = async (): Promise<string[]> => {
	const entries = await fs.readdir(resumableDir).catch(() => [] as string[])
	return entries.filter((entry) => SESSION_ID_PATTERN.test(entry))
}

const openSessionsOf = async (userId: string): Promise<ResumableUpload[]> => {
	const sessions = await Promise.all(
		(await listSessionIds()).map((id) => readSession(id).catch(() => null))
	)
	return sessions.filter((session): session is ResumableUpload => session?.userId === userId)
}

const cleanFileName = (fileName: string): string =>
	path
		.basename(fileName.replace(/\\/g, "/"))
		.replace(/[\u0000-\u001F\u007F]/g, "")
		.slice(0, MAX_FILE_NAME_LENGTH)
		.trim()

export const startUpload = (input: StartUpload): Promise<ResumableUpload> =>
	serialised(`user:${input.userId}`, () => openSession(input))

const openSession = async (input: StartUpload): Promise<ResumableUpload> => {
	if (!isAllowedMime(input.mimeType)) {
		throw new ValidationError(`Unsupported file type (${input.mimeType}).`)
	}
	if (input.size > maxUploadMb * 1024 * 1024) {
		throw new ValidationError(oversizedUploadMessage())
	}
	const fileName = cleanFileName(input.fileName)
	if (!fileName) throw new ValidationError("The file needs a name.")
	const open = await openSessionsOf(input.userId)
	if (open.length >= MAX_OPEN_UPLOADS_PER_USER) throw new TooManyUploadsError()
	const reserved = open.reduce((sum, session) => sum + session.size, 0)
	if (reserved + input.size > openUploadQuotaBytes()) throw new UploadQuotaError()

	const now = new Date().toISOString()
	const session: ResumableUpload = {
		id: randomBytes(16).toString("hex"),
		userId: input.userId,
		projectId: input.projectId,
		fileName,
		mimeType: input.mimeType,
		size: input.size,
		received: 0,
		createdAt: now,
		updatedAt: now,
	}
	await fs.mkdir(sessionDir(session.id), { recursive: true })
	await fs.writeFile(dataPath(session.id), "")
	await writeSession(session)
	return session
}

export const findUpload = async (
	id: string,
	userId: string
): Promise<ResumableUpload> => {
	const session = await readSession(id)
	if (!session || session.userId !== userId) {
		throw new NotFoundError("Upload not found")
	}
	return session
}

export const projectIdOfUpload = async (id: string): Promise<string | null> => {
	try {
		return (await readSession(id))?.projectId ?? null
	} catch {
		return null
	}
}

const appendQueues = new Map<string, Promise<unknown>>()

const serialised = <T>(id: string, work: () => Promise<T>): Promise<T> => {
	const previous = appendQueues.get(id) ?? Promise.resolve()
	const next = previous.then(work, work)
	const settled = next.catch(() => undefined)
	appendQueues.set(id, settled)
	void settled.then(() => {
		if (appendQueues.get(id) === settled) appendQueues.delete(id)
	})
	return next
}

export const isComplete = (session: ResumableUpload): boolean =>
	session.received === session.size

export const appendChunk = (
	id: string,
	userId: string,
	offset: number,
	chunk: Buffer
): Promise<ResumableUpload> =>
	serialised(id, async () => {
		const session = await findUpload(id, userId)
		if (offset !== session.received) throw new OffsetMismatchError(session.received)
		if (chunk.length === 0 && !isComplete(session)) {
			throw new ValidationError("The chunk was empty.")
		}
		if (chunk.length > RESUMABLE_CHUNK_BYTES) {
			throw new ValidationError(`Chunks may be at most ${RESUMABLE_CHUNK_BYTES} bytes.`)
		}
		if (session.received + chunk.length > session.size) {
			throw new ValidationError("The chunk runs past the declared file size.")
		}

		const handle = await fs.open(dataPath(id), "r+")
		try {
			await handle.write(chunk, 0, chunk.length, offset)
		} finally {
			await handle.close()
		}

		const updated: ResumableUpload = {
			...session,
			received: session.received + chunk.length,
			updatedAt: new Date().toISOString(),
		}
		await writeSession(updated)

		if (isComplete(updated)) {
			const matches = await fileMatchesDeclaredMime(dataPath(id), updated.mimeType).catch(
				() => false
			)
			if (!matches) {
				await discardUpload(id)
				throw new ValidationError(
					`The content of "${updated.fileName}" does not match its declared type (${updated.mimeType}).`
				)
			}
		}
		return updated
	})

export const discardUpload = async (id: string): Promise<void> => {
	await fs.rm(sessionDir(id), { recursive: true, force: true }).catch(() => undefined)
}

export interface ClaimedUpload {
	fileName: string
	mimeType: string
	size: number
	path: string
}

const linkOrCopy = async (source: string, target: string): Promise<void> => {
	try {
		await fs.link(source, target)
	} catch {
		await fs.copyFile(source, target)
	}
}

const isActivelyClaimed = (session: ResumableUpload, now = Date.now()): boolean =>
	!!session.claimedAt && now - Date.parse(session.claimedAt) < STALE_CLAIM_MS

export const claimCompletedUpload = (
	id: string,
	userId: string,
	projectId: string,
	fieldName: string
): Promise<ClaimedUpload> =>
	serialised(id, async () => {
		const session = await findUpload(id, userId)
		if (session.projectId !== projectId) {
			throw new ValidationError("That upload belongs to a different project.")
		}
		if (!isComplete(session)) {
			throw new ValidationError(`"${session.fileName}" has not finished uploading.`)
		}
		if (isActivelyClaimed(session)) {
			throw new ValidationError(`"${session.fileName}" is already being added.`)
		}
		const target = stagedUploadPath(fieldName, session.mimeType)
		await linkOrCopy(dataPath(id), target)
		const now = new Date().toISOString()
		await writeSession({ ...session, claimedAt: now, updatedAt: now })
		return {
			fileName: session.fileName,
			mimeType: session.mimeType,
			size: session.size,
			path: target,
		}
	})

export const settleClaimedUpload = (
	id: string,
	userId: string,
	succeeded: boolean
): Promise<void> =>
	serialised(id, async () => {
		if (succeeded) {
			await discardUpload(id)
			return
		}
		const session = await readSession(id).catch(() => null)
		if (session?.userId === userId) await writeSession({ ...session, claimedAt: null })
	})

const isMissingFile = (error: unknown): boolean =>
	(error as NodeJS.ErrnoException)?.code === "ENOENT"

const lastActivityOf = async (id: string): Promise<number | null> => {
	try {
		const session = JSON.parse(await fs.readFile(metaPath(id), "utf8")) as ResumableUpload
		return Date.parse(session.updatedAt)
	} catch (error) {
		if (!isMissingFile(error) && !(error instanceof SyntaxError)) return null
		const folder = await fs.stat(sessionDir(id)).catch(() => null)
		return folder ? folder.mtimeMs : null
	}
}

export const reapIdleUploads = async (now = Date.now()): Promise<number> => {
	let removed = 0
	for (const id of await listSessionIds()) {
		const lastActivity = await lastActivityOf(id)
		if (lastActivity === null || now - lastActivity < SESSION_IDLE_LIMIT_MS) continue
		await discardUpload(id)
		removed++
	}
	if (removed > 0) logger.warn("Reaped idle resumable uploads", { removed })
	return removed
}

const REAP_INTERVAL_MS = 3600000

export const startResumableUploadReaper = (): NodeJS.Timeout => {
	const reap = () =>
		reapIdleUploads().catch((error) =>
			logger.error("Resumable upload reaper failed", error)
		)
	void reap()
	const timer = setInterval(reap, REAP_INTERVAL_MS)
	timer.unref()
	return timer
}
