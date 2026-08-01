"use client"

import { useState } from "react"
import { Download, FileText, FileJson, Printer, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { Image as ImageType, ImageVersion, Annotation } from "@/types"
import { mediaUrl } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface ExportMenuProps {
	image: ImageType
	selectedVersion: ImageVersion | null
	annotations: Annotation[]
}

function drawAnnotations(
	ctx: CanvasRenderingContext2D,
	annotations: Annotation[],
	w: number,
	h: number
) {
	annotations.forEach((a) => {
		if (!a.points || a.points.length === 0) return
		ctx.strokeStyle = a.color
		ctx.lineWidth = Math.max(2, w / 400)
		ctx.lineCap = "round"
		ctx.lineJoin = "round"
		ctx.beginPath()
		const [start, end] = a.points
		if (!start) return
		if (a.type === "pencil") {
			ctx.moveTo(start.x * w, start.y * h)
			a.points.forEach((p) => ctx.lineTo(p.x * w, p.y * h))
		} else if (a.type === "rect" && end) {
			ctx.rect(
				start.x * w,
				start.y * h,
				(end.x - start.x) * w,
				(end.y - start.y) * h
			)
		} else if (a.type === "line" && end) {
			ctx.moveTo(start.x * w, start.y * h)
			ctx.lineTo(end.x * w, end.y * h)
		}
		ctx.stroke()
	})
}

const handleGateResponse = async (res: Response): Promise<boolean> => {
	if (res.status === 403) {
		toast.error("You don't have access to export this project.")
		return true
	}
	return false
}

export function ExportMenu({
	image,
	selectedVersion,
	annotations,
}: ExportMenuProps) {
	const [busy, setBusy] = useState(false)
	const isImage = (selectedVersion?.mediaType ?? "IMAGE") === "IMAGE"

	const downloadOriginal = () => {
		if (!selectedVersion) return
		const a = document.createElement("a")
		a.href = `${API_URL}/api/images/versions/${selectedVersion.id}/download`
		a.rel = "noopener"
		a.click()
	}

	const downloadAnnotatedPng = async () => {
		if (!selectedVersion) return
		setBusy(true)
		try {
			const img = new window.Image()
			img.crossOrigin = "anonymous"
			img.src = mediaUrl(selectedVersion.url)
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve()
				img.onerror = () => reject(new Error("Failed to load image"))
			})
			const canvas = document.createElement("canvas")
			canvas.width = img.naturalWidth
			canvas.height = img.naturalHeight
			const ctx = canvas.getContext("2d")
			if (!ctx) throw new Error("Canvas not supported")
			ctx.drawImage(img, 0, 0)
			drawAnnotations(ctx, annotations, canvas.width, canvas.height)
			canvas.toBlob((blob) => {
				if (!blob) return
				const url = URL.createObjectURL(blob)
				const a = document.createElement("a")
				a.href = url
				a.download = `${image.name || "image"}-annotated.png`
				a.click()
				URL.revokeObjectURL(url)
			})
		} catch {
			toast.error("Could not export image. The file may be unavailable.")
		} finally {
			setBusy(false)
		}
	}

	const downloadReport = async (format: "csv" | "json") => {
		setBusy(true)
		try {
			const res = await fetch(
				`${API_URL}/api/export/image/${image.id}/report.${format}`,
				{ credentials: "include" }
			)
			if (await handleGateResponse(res)) return
			if (!res.ok) {
				toast.error("Could not generate the report.")
				return
			}
			const blob = await res.blob()
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `${image.name || "report"}-report.${format}`
			a.click()
			URL.revokeObjectURL(url)
		} catch {
			toast.error("Could not generate the report.")
		} finally {
			setBusy(false)
		}
	}

	const printReport = async () => {
		setBusy(true)
		try {
			const res = await fetch(
				`${API_URL}/api/export/image/${image.id}/report.json`,
				{ credentials: "include" }
			)
			if (await handleGateResponse(res)) return
			if (!res.ok) {
				toast.error("Could not generate the report.")
				return
			}
			const report = await res.json()
			const win = window.open("", "_blank")
			if (!win) {
				toast.error("Please allow pop-ups to print the report.")
				return
			}
			win.document.write(buildPrintableHtml(report))
			win.document.close()
			win.focus()
			setTimeout(() => win.print(), 400)
		} catch {
			toast.error("Could not generate the report.")
		} finally {
			setBusy(false)
		}
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy}>
					{busy ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Download className="h-3.5 w-3.5" />
					)}
					Export
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="text-xs">Export</DropdownMenuLabel>
				<DropdownMenuItem
					className="text-xs"
					onClick={downloadOriginal}
					disabled={!selectedVersion}
				>
					<Download className="mr-2 h-3.5 w-3.5" />
					Original file
				</DropdownMenuItem>
				{isImage && (
					<DropdownMenuItem className="text-xs" onClick={downloadAnnotatedPng}>
						<Download className="mr-2 h-3.5 w-3.5" />
						Annotated image (PNG)
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem className="text-xs" onClick={() => downloadReport("csv")}>
					<FileText className="mr-2 h-3.5 w-3.5" />
					Report (CSV)
				</DropdownMenuItem>
				<DropdownMenuItem className="text-xs" onClick={() => downloadReport("json")}>
					<FileJson className="mr-2 h-3.5 w-3.5" />
					Report (JSON)
				</DropdownMenuItem>
				<DropdownMenuItem className="text-xs" onClick={printReport}>
					<Printer className="mr-2 h-3.5 w-3.5" />
					Print report (PDF)
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function escapeHtml(s: unknown): string {
	return String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

interface ReportComment {
	author?: string
	content?: string
	resolved?: boolean
	timestamp?: number | null
	annotationCount?: number
}
interface ReportVersion {
	versionName?: string
	comments?: ReportComment[]
}
interface ImageReport {
	image?: { name?: string; projectName?: string }
	generatedAt?: string
	summary?: {
		totalVersions?: number
		totalComments?: number
		resolvedComments?: number
		openComments?: number
	}
	versions?: ReportVersion[]
}

function buildPrintableHtml(report: ImageReport): string {
	const rows = (report.versions || [])
		.flatMap((v: ReportVersion) =>
			(v.comments || []).map(
				(c: ReportComment) => `
				<tr>
					<td>${escapeHtml(v.versionName)}</td>
					<td>${escapeHtml(c.author)}</td>
					<td>${escapeHtml(c.content)}</td>
					<td>${c.resolved ? "Resolved" : "Open"}</td>
					<td>${c.timestamp != null ? Number(c.timestamp).toFixed(1) + "s" : "—"}</td>
					<td>${c.annotationCount || 0}</td>
				</tr>`
			)
		)
		.join("")

	return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
		report.image?.name
	)} — Report</title>
	<style>
		body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:40px;}
		h1{font-size:20px;margin-bottom:4px;} .muted{color:#666;font-size:13px;}
		.summary{margin:16px 0;display:flex;gap:24px;font-size:13px;}
		table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;}
		th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;}
		th{background:#f5f5f5;}
	</style></head><body>
	<h1>${escapeHtml(report.image?.name)}</h1>
	<div class="muted">Project: ${escapeHtml(
		report.image?.projectName
	)} · Generated ${escapeHtml(report.generatedAt)}</div>
	<div class="summary">
		<div><strong>${report.summary?.totalVersions ?? 0}</strong> versions</div>
		<div><strong>${report.summary?.totalComments ?? 0}</strong> comments</div>
		<div><strong>${report.summary?.resolvedComments ?? 0}</strong> resolved</div>
		<div><strong>${report.summary?.openComments ?? 0}</strong> open</div>
	</div>
	<table>
		<thead><tr><th>Version</th><th>Author</th><th>Comment</th><th>Status</th><th>Time</th><th>Drawings</th></tr></thead>
		<tbody>${rows || '<tr><td colspan="6">No comments</td></tr>'}</tbody>
	</table>
	</body></html>`
}
