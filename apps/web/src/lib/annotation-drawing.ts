import { Annotation, Point } from "@/types"

export function drawAnnotations(
	ctx: CanvasRenderingContext2D,
	annotations: Pick<
		Annotation,
		"type" | "color" | "points" | "isHighlighted" | "dimmed"
	>[],
	width: number,
	height: number
): void {
	annotations.forEach((annotation) => {
		const { type, color, points, isHighlighted, dimmed } = annotation
		if (!points || points.length === 0) return

		ctx.save()
		ctx.globalAlpha = dimmed ? 0.35 : 1
		ctx.strokeStyle = color
		ctx.lineWidth = isHighlighted ? 4 : 2
		ctx.lineCap = "round"
		ctx.lineJoin = "round"
		ctx.beginPath()

		if (type === "pencil") {
			const first = points[0] as Point
			ctx.moveTo(first.x * width, first.y * height)
			points.forEach((p) => ctx.lineTo(p.x * width, p.y * height))
		} else if (type === "rect" && points.length >= 2) {
			const s = points[0] as Point
			const e = points[1] as Point
			ctx.rect(
				s.x * width,
				s.y * height,
				(e.x - s.x) * width,
				(e.y - s.y) * height
			)
		} else if (type === "line" && points.length >= 2) {
			const s = points[0] as Point
			const e = points[1] as Point
			ctx.moveTo(s.x * width, s.y * height)
			ctx.lineTo(e.x * width, e.y * height)
		}

		ctx.stroke()
		ctx.restore()
	})
}
