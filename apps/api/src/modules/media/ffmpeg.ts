import { spawn } from "child_process"
import ffmpegBinary from "ffmpeg-static"
import { path as ffprobeBinary } from "ffprobe-static"
import { timecodeBase, timecodeToFrames } from "../../lib/timecode"

const MAX_REPORTED_ERROR_LINES = 6

const PROBE_TIMEOUT_MS = 30000
const STILL_RENDER_TIMEOUT_MS = 300000
const DEFAULT_TRANSCODE_TIMEOUT_MS = 3600000

const transcodeTimeoutMs = (): number => {
	const configured = Number(process.env.FFMPEG_TRANSCODE_TIMEOUT_MS)
	return Number.isFinite(configured) && configured > 0
		? configured
		: DEFAULT_TRANSCODE_TIMEOUT_MS
}

const localFilesOnly = ["-protocol_whitelist", "file"]

const reportableFailure = (stderr: string): string => {
	const lines = stderr
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
	const complaints = lines.filter((line) =>
		/error|invalid|unsupported|unable|failed|no such|permission/i.test(line)
	)
	const relevant = complaints.length > 0 ? complaints : lines
	return relevant.slice(-MAX_REPORTED_ERROR_LINES).join(" | ")
}

const run = (
	binary: string | null,
	args: string[],
	timeoutMs: number
): Promise<string> =>
	new Promise((resolve, reject) => {
		if (!binary) {
			reject(new Error("ffmpeg binaries are not installed"))
			return
		}
		const child = spawn(binary, args, { windowsHide: true })
		let stdout = ""
		let stderr = ""
		let timedOut = false
		const killTimer = setTimeout(() => {
			timedOut = true
			child.kill("SIGKILL")
		}, timeoutMs)
		child.stdout.on("data", (chunk) => (stdout += chunk))
		child.stderr.on("data", (chunk) => (stderr += chunk))
		child.on("error", (error) => {
			clearTimeout(killTimer)
			reject(error)
		})
		child.on("close", (code) => {
			clearTimeout(killTimer)
			if (timedOut) {
				reject(new Error(`ffmpeg was killed after ${timeoutMs}ms`))
			} else if (code === 0) {
				resolve(stdout)
			} else {
				reject(
					new Error(`ffmpeg exited with ${code}: ${reportableFailure(stderr)}`)
				)
			}
		})
	})

export const probeDuration = async (
	filePath: string
): Promise<number | null> => {
	try {
		const output = await run(
			ffprobeBinary,
			[
				"-v",
				"error",
				...localFilesOnly,
				"-show_entries",
				"format=duration",
				"-of",
				"csv=p=0",
				filePath,
			],
			PROBE_TIMEOUT_MS
		)
		const duration = Number.parseFloat(output.trim())
		return Number.isFinite(duration) && duration >= 0 ? duration : null
	} catch {
		return null
	}
}

const MAX_PLAUSIBLE_FRAME_RATE = 1000

export const parseFrameRate = (raw: string): number | null => {
	const [numerator, denominator] = raw.trim().split("/")
	const top = Number.parseFloat(numerator)
	const bottom = denominator === undefined ? 1 : Number.parseFloat(denominator)

	if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) {
		return null
	}

	const frameRate = top / bottom
	return frameRate > 0 && frameRate <= MAX_PLAUSIBLE_FRAME_RATE
		? frameRate
		: null
}

export interface VideoDetails {
	frameRate: number | null
	frameRateExpression: string | null
	width: number | null
	height: number | null
	startTimecode: string | null
}

interface ProbedStream {
	codec_type?: string
	avg_frame_rate?: string
	width?: number
	height?: number
	tags?: { timecode?: string }
}

interface ProbeOutput {
	streams?: ProbedStream[]
	format?: { tags?: { timecode?: string } }
}

const SMPTE_TIMECODE = /^\d{2}:[0-5]\d:[0-5]\d[:;]\d{2}$/

export const parseTimecode = (raw: string | undefined): string | null => {
	const candidate = raw?.trim() ?? ""
	return SMPTE_TIMECODE.test(candidate) ? candidate : null
}

const positiveDimension = (value: number | undefined): number | null =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: null

const NO_VIDEO_DETAILS: VideoDetails = {
	frameRate: null,
	frameRateExpression: null,
	width: null,
	height: null,
	startTimecode: null,
}

export const parseVideoDetails = (rawJson: string): VideoDetails => {
	let probe: ProbeOutput
	try {
		probe = JSON.parse(rawJson) as ProbeOutput
	} catch {
		return NO_VIDEO_DETAILS
	}
	const streams = probe.streams ?? []
	const video = streams.find((stream) => stream.codec_type === "video")
	const frameRate = video?.avg_frame_rate
		? parseFrameRate(video.avg_frame_rate)
		: null
	const startTimecode =
		parseTimecode(probe.format?.tags?.timecode) ??
		streams
			.map((stream) => parseTimecode(stream.tags?.timecode))
			.find((timecode) => timecode !== null) ??
		null

	const fitsFrameRate =
		startTimecode !== null && timecodeToFrames(startTimecode, timecodeBase(frameRate)) !== null
	return {
		frameRate,
		frameRateExpression: frameRate ? video!.avg_frame_rate!.trim() : null,
		width: positiveDimension(video?.width),
		height: positiveDimension(video?.height),
		startTimecode: fitsFrameRate ? startTimecode : null,
	}
}

export const probeVideoDetails = async (
	filePath: string
): Promise<VideoDetails> => {
	try {
		const output = await run(
			ffprobeBinary,
			[
				"-v",
				"error",
				...localFilesOnly,
				"-show_entries",
				"stream=codec_type,avg_frame_rate,width,height:stream_tags=timecode:format_tags=timecode",
				"-of",
				"json",
				filePath,
			],
			PROBE_TIMEOUT_MS
		)
		return parseVideoDetails(output)
	} catch {
		return NO_VIDEO_DETAILS
	}
}

export interface WebRendition {
	outputPath: string
	maxWidth: number
	maxHeight: number
	crf: number
	audioBitrate: string
}

export const FULL_RENDITION = { maxWidth: 1920, maxHeight: 1080, crf: 23, audioBitrate: "128k" }
export const LOW_RENDITION = { maxWidth: 960, maxHeight: 540, crf: 26, audioBitrate: "96k" }

export const exceedsRendition = (
	details: Pick<VideoDetails, "width" | "height">,
	rendition: Pick<WebRendition, "maxWidth" | "maxHeight">
): boolean =>
	details.width !== null &&
	details.height !== null &&
	(details.width > rendition.maxWidth || details.height > rendition.maxHeight)

const KEYFRAME_EVERY_SECOND = "expr:gte(t,n_forced*1)"

export const renditionArgs = (
	rendition: WebRendition,
	frameRateExpression: string | null
): string[] => [
	"-vf",
	`scale=w='min(iw,${rendition.maxWidth})':h='min(ih,${rendition.maxHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2`,
	"-c:v",
	"libx264",
	"-preset",
	"veryfast",
	"-crf",
	String(rendition.crf),
	"-pix_fmt",
	"yuv420p",
	"-fps_mode",
	"cfr",
	...(frameRateExpression ? ["-r", frameRateExpression] : []),
	"-force_key_frames",
	KEYFRAME_EVERY_SECOND,
	"-c:a",
	"aac",
	"-b:a",
	rendition.audioBitrate,
	"-movflags",
	"+faststart",
	rendition.outputPath,
]

export const transcodeToWebProxies = async (
	sourcePath: string,
	renditions: WebRendition[],
	frameRateExpression: string | null
): Promise<void> => {
	await run(
		ffmpegBinary,
		[
			"-y",
			"-nostdin",
			...localFilesOnly,
			"-i",
			sourcePath,
			...renditions.flatMap((rendition) =>
				renditionArgs(rendition, frameRateExpression)
			),
		],
		transcodeTimeoutMs()
	)
}

export const renderBrowserSafeImage = async (
	sourcePath: string,
	outputPath: string
): Promise<void> => {
	await run(
		ffmpegBinary,
		[
			"-y",
			"-nostdin",
			...localFilesOnly,
			"-i",
			sourcePath,
			"-frames:v",
			"1",
			"-vf",
			"scale=w=4096:h=4096:force_original_aspect_ratio=decrease:force_divisible_by=2",
			"-pix_fmt",
			"rgba",
			outputPath,
		],
		STILL_RENDER_TIMEOUT_MS
	)
}

export const capturePosterFrame = async (
	sourcePath: string,
	outputPath: string
): Promise<void> => {
	await run(
		ffmpegBinary,
		[
			"-y",
			"-nostdin",
			...localFilesOnly,
			"-i",
			sourcePath,
			"-frames:v",
			"1",
			"-vf",
			"scale=w=640:h=640:force_original_aspect_ratio=decrease:force_divisible_by=2",
			outputPath,
		],
		STILL_RENDER_TIMEOUT_MS
	)
}
