import { prisma } from "../../lib/prisma"
import { ValidationError } from "../../lib/errors"
import {
	TimecodeBase,
	frameAt,
	framesToTimecode,
	timecodeBase,
	timecodeToFrames,
} from "../../lib/timecode"

export interface ReviewMarker {
	frame: number
	durationFrames: number
	author: string
	note: string
	resolved: boolean
}

export interface VersionMarkers {
	imageName: string
	versionName: string
	base: TimecodeBase
	startTimecode: string | null
	durationFrames: number
	markers: ReviewMarker[]
}

const DEFAULT_TIMELINE_START = "01:00:00:00"
const MAX_NOTE_LENGTH = 240
const MIN_MARKER_FRAMES = 1

const singleLine = (text: string): string =>
	text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim()

const noteOf = (content: string, resolved: boolean): string => {
	const note = singleLine(content).slice(0, MAX_NOTE_LENGTH)
	return resolved ? `[resolved] ${note}` : note
}

export const buildVersionMarkers = async (
	versionId: string,
	includeInternal: boolean
): Promise<VersionMarkers | null> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: versionId },
		select: {
			mediaType: true,
			versionName: true,
			frameRate: true,
			duration: true,
			startTimecode: true,
			image: { select: { name: true } },
			comments: {
				where: {
					parentId: null,
					timestamp: { not: null },
					...(includeInternal ? {} : { internal: false }),
				},
				orderBy: { timestamp: "asc" },
				select: {
					content: true,
					resolved: true,
					timestamp: true,
					timestampEnd: true,
					user: { select: { name: true, email: true } },
				},
			},
		},
	})
	if (!version) return null
	if (version.mediaType !== "VIDEO") {
		throw new ValidationError("Markers can only be exported for a video version.")
	}

	const base = timecodeBase(version.frameRate)
	const markers = version.comments.map((comment) => {
		const frame = frameAt(comment.timestamp ?? 0, base)
		const endFrame =
			typeof comment.timestampEnd === "number"
				? frameAt(comment.timestampEnd, base)
				: frame
		return {
			frame,
			durationFrames: Math.max(MIN_MARKER_FRAMES, endFrame - frame),
			author: singleLine(comment.user?.name || comment.user?.email || "Reviewer"),
			note: noteOf(comment.content, comment.resolved),
			resolved: comment.resolved,
		}
	})

	return {
		imageName: version.image.name,
		versionName: version.versionName,
		base,
		startTimecode: version.startTimecode,
		durationFrames: Math.max(
			frameAt(version.duration ?? 0, base),
			...markers.map((marker) => marker.frame + marker.durationFrames)
		),
		markers,
	}
}

export const timelineStartFrames = (
	markers: VersionMarkers,
	requestedStart: string | null
): number | null => {
	if (requestedStart) return timecodeToFrames(requestedStart, markers.base)
	const recorded = markers.startTimecode
		? timecodeToFrames(markers.startTimecode, markers.base)
		: null
	return recorded ?? timecodeToFrames(DEFAULT_TIMELINE_START, markers.base)
}

const edlField = (text: string): string => text.replace(/\|/g, "/")

const EDL_EVENT_NUMBER_WIDTH = 3

export const renderResolveEdl = (
	markers: VersionMarkers,
	startFrames: number
): string => {
	const { base } = markers
	const title = edlField(singleLine(`${markers.imageName} - ${markers.versionName}`))
	const lines = [
		`TITLE: ${title}`,
		`FCM: ${base.dropFrame ? "DROP FRAME" : "NON-DROP FRAME"}`,
		"",
	]
	markers.markers.forEach((marker, index) => {
		const event = String(index + 1).padStart(EDL_EVENT_NUMBER_WIDTH, "0")
		const markIn = framesToTimecode(startFrames + marker.frame, base)
		const markOut = framesToTimecode(startFrames + marker.frame + 1, base)
		const color = marker.resolved ? "ResolveColorGreen" : "ResolveColorBlue"
		lines.push(
			`${event}  001      V     C        ${markIn} ${markOut} ${markIn} ${markOut}  `,
			`${edlField(marker.note)} |C:${color} |M:${edlField(marker.author)} |D:${marker.durationFrames}`,
			""
		)
	})
	return lines.join("\r\n")
}

const xmlEscape = (text: string): string =>
	text
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")

const xmlRate = (base: TimecodeBase): string =>
	`<rate><timebase>${base.nominalRate}</timebase><ntsc>${
		base.frameRate % 1 !== 0 ? "TRUE" : "FALSE"
	}</ntsc></rate>`

export const renderFcp7Xml = (
	markers: VersionMarkers,
	startFrames: number
): string => {
	const { base } = markers
	const name = xmlEscape(`${markers.imageName} - ${markers.versionName} (review)`)
	const markerXml = markers.markers
		.map((marker) => {
			const out =
				marker.durationFrames > MIN_MARKER_FRAMES
					? marker.frame + marker.durationFrames
					: -1
			return [
				"\t\t<marker>",
				`\t\t\t<name>${xmlEscape(marker.author)}</name>`,
				`\t\t\t<comment>${xmlEscape(marker.note)}</comment>`,
				`\t\t\t<in>${marker.frame}</in>`,
				`\t\t\t<out>${out}</out>`,
				"\t\t</marker>",
			].join("\n")
		})
		.join("\n")

	return [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		"<!DOCTYPE xmeml>",
		`<xmeml version="5">`,
		`\t<sequence id="sculpt-review">`,
		`\t\t<name>${name}</name>`,
		`\t\t<duration>${Math.max(1, markers.durationFrames)}</duration>`,
		`\t\t${xmlRate(base)}`,
		"\t\t<timecode>",
		`\t\t\t${xmlRate(base)}`,
		`\t\t\t<string>${framesToTimecode(startFrames, base)}</string>`,
		`\t\t\t<frame>${startFrames}</frame>`,
		`\t\t\t<displayformat>${base.dropFrame ? "DF" : "NDF"}</displayformat>`,
		"\t\t</timecode>",
		"\t\t<media>",
		"\t\t\t<video><track/></video>",
		"\t\t\t<audio><track/></audio>",
		"\t\t</media>",
		markerXml,
		"\t</sequence>",
		"</xmeml>",
		"",
	]
		.filter((line) => line !== "")
		.join("\n")
}
