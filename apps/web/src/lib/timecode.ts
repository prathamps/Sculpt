import { formatVideoTime } from "@/lib/utils"

export interface TimecodeBase {
	frameRate: number
	nominalRate: number
	dropFrame: boolean
}

export type TimeDisplayMode = "timecode" | "seconds" | "frames"

export const TIME_DISPLAY_MODES: TimeDisplayMode[] = ["timecode", "seconds", "frames"]

const DEFAULT_FRAME_RATE = 30
const NTSC_RATIO = 1000 / 1001
const NTSC_TOLERANCE = 0.01
const FRAME_EPSILON = 0.001
const HOURS_PER_DAY = 24

const isNtscRate = (frameRate: number, nominalRate: number): boolean =>
	Math.abs(frameRate - nominalRate * NTSC_RATIO) < NTSC_TOLERANCE

export const timecodeBase = (frameRate: number | null | undefined): TimecodeBase => {
	const rate =
		typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0
			? frameRate
			: DEFAULT_FRAME_RATE
	const nominalRate = Math.max(1, Math.round(rate))
	return {
		frameRate: rate,
		nominalRate,
		dropFrame:
			(nominalRate === 30 || nominalRate === 60) && isNtscRate(rate, nominalRate),
	}
}

const droppedPerMinute = (base: TimecodeBase): number =>
	base.dropFrame ? base.nominalRate / 15 : 0

export const frameAt = (seconds: number, base: TimecodeBase): number =>
	Math.max(0, Math.floor(Math.max(0, seconds) * base.frameRate + FRAME_EPSILON))

export const frameMidpoint = (frame: number, base: TimecodeBase): number =>
	(Math.max(0, frame) + 0.5) / base.frameRate

export const lastFrameOf = (duration: number, base: TimecodeBase): number =>
	Math.max(0, Math.ceil(duration * base.frameRate - FRAME_EPSILON) - 1)

const pad = (value: number): string => String(value).padStart(2, "0")

export const framesToTimecode = (frames: number, base: TimecodeBase): string => {
	const { nominalRate } = base
	const drop = droppedPerMinute(base)
	let count = Math.max(0, Math.floor(frames))

	if (drop > 0) {
		const framesPerTenMinutes = nominalRate * 600 - drop * 9
		const framesPerMinute = nominalRate * 60 - drop
		const tens = Math.floor(count / framesPerTenMinutes)
		const remainder = count % framesPerTenMinutes
		count +=
			drop * 9 * tens +
			(remainder > drop ? drop * Math.floor((remainder - drop) / framesPerMinute) : 0)
	}

	const frame = count % nominalRate
	const totalSeconds = Math.floor(count / nominalRate)
	const second = totalSeconds % 60
	const minute = Math.floor(totalSeconds / 60) % 60
	const hour = Math.floor(totalSeconds / 3600) % HOURS_PER_DAY
	const separator = base.dropFrame ? ";" : ":"
	return `${pad(hour)}:${pad(minute)}:${pad(second)}${separator}${pad(frame)}`
}

const TIMECODE_PATTERN = /^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/

export const timecodeToFrames = (
	timecode: string,
	base: TimecodeBase
): number | null => {
	const match = TIMECODE_PATTERN.exec(timecode.trim())
	if (!match) return null
	const [hour = 0, minute = 0, second = 0, frame = 0] = match.slice(1).map(Number)
	if (minute > 59 || second > 59 || frame >= base.nominalRate) return null
	const totalMinutes = hour * 60 + minute
	const nominalFrames = (totalMinutes * 60 + second) * base.nominalRate + frame
	const drop = droppedPerMinute(base)
	return nominalFrames - drop * (totalMinutes - Math.floor(totalMinutes / 10))
}

export interface VideoTiming {
	base: TimecodeBase
	startTimecode: string | null
}

export const videoTimingFor = (
	frameRate: number | null | undefined,
	startTimecode: string | null | undefined
): VideoTiming => ({ base: timecodeBase(frameRate), startTimecode: startTimecode ?? null })

export const secondsToTimecode = (seconds: number, timing: VideoTiming): string => {
	const start = timing.startTimecode
		? timecodeToFrames(timing.startTimecode, timing.base) ?? 0
		: 0
	return framesToTimecode(start + frameAt(seconds, timing.base), timing.base)
}

export const formatPlayhead = (
	seconds: number,
	mode: TimeDisplayMode,
	timing: VideoTiming,
	precise = false
): string => {
	if (mode === "timecode") return secondsToTimecode(seconds, timing)
	if (mode === "frames") return `${frameAt(seconds, timing.base)}f`
	return formatVideoTime(seconds, precise)
}

export const nextTimeDisplayMode = (mode: TimeDisplayMode): TimeDisplayMode =>
	TIME_DISPLAY_MODES[(TIME_DISPLAY_MODES.indexOf(mode) + 1) % TIME_DISPLAY_MODES.length] ??
	"timecode"

export const TIME_DISPLAY_LABELS: Record<TimeDisplayMode, string> = {
	timecode: "SMPTE timecode",
	seconds: "minutes and seconds",
	frames: "frame number",
}
