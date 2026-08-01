import { spawn } from "child_process"
import ffmpegBinary from "ffmpeg-static"
import { path as ffprobeBinary } from "ffprobe-static"

const MAX_REPORTED_ERROR_LINES = 6

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

const run = (binary: string | null, args: string[]): Promise<string> =>
	new Promise((resolve, reject) => {
		if (!binary) {
			reject(new Error("ffmpeg binaries are not installed"))
			return
		}
		const child = spawn(binary, args, { windowsHide: true })
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", (chunk) => (stdout += chunk))
		child.stderr.on("data", (chunk) => (stderr += chunk))
		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) resolve(stdout)
			else reject(new Error(`ffmpeg exited with ${code}: ${reportableFailure(stderr)}`))
		})
	})

export const probeDuration = async (
	filePath: string
): Promise<number | null> => {
	try {
		const output = await run(ffprobeBinary, [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			filePath,
		])
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

export const probeFrameRate = async (
	filePath: string
): Promise<number | null> => {
	try {
		const output = await run(ffprobeBinary, [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=avg_frame_rate",
			"-of",
			"csv=p=0",
			filePath,
		])
		return parseFrameRate(output)
	} catch {
		return null
	}
}

export const transcodeToWebProxy = async (
	sourcePath: string,
	outputPath: string
): Promise<void> => {
	await run(ffmpegBinary, [
		"-y",
		"-i",
		sourcePath,
		"-vf",
		"scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2",
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		"23",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-movflags",
		"+faststart",
		outputPath,
	])
}

export const renderBrowserSafeImage = async (
	sourcePath: string,
	outputPath: string
): Promise<void> => {
	await run(ffmpegBinary, [
		"-y",
		"-i",
		sourcePath,
		"-frames:v",
		"1",
		"-vf",
		"scale=w=4096:h=4096:force_original_aspect_ratio=decrease:force_divisible_by=2",
		"-pix_fmt",
		"rgba",
		outputPath,
	])
}

export const capturePosterFrame = async (
	sourcePath: string,
	outputPath: string
): Promise<void> => {
	await run(ffmpegBinary, [
		"-y",
		"-i",
		sourcePath,
		"-frames:v",
		"1",
		"-vf",
		"scale=w=640:h=640:force_original_aspect_ratio=decrease:force_divisible_by=2",
		outputPath,
	])
}
