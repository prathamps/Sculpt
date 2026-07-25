import { spawn } from "child_process"
import ffmpegBinary from "ffmpeg-static"
import { path as ffprobeBinary } from "ffprobe-static"

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
			else reject(new Error(`${binary} exited with ${code}: ${stderr.slice(-500)}`))
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
