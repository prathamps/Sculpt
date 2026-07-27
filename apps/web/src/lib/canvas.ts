const MAX_PIXEL_RATIO = 3

export const devicePixelRatio = (): number => {
	if (typeof window === "undefined") return 1
	return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
}

export const scaleContextToPixelRatio = (
	canvas: HTMLCanvasElement,
	pixelRatio: number
): void => {
	const context = canvas.getContext("2d")
	if (!context) return
	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
}

export const cssCanvasSize = (
	canvas: HTMLCanvasElement
): { width: number; height: number } => ({
	width: canvas.clientWidth || canvas.width,
	height: canvas.clientHeight || canvas.height,
})

export const observeElementSize = (
	element: HTMLElement | null,
	onResize: () => void
): (() => void) => {
	if (!element) return () => {}

	if (typeof ResizeObserver === "undefined") {
		window.addEventListener("resize", onResize)
		return () => window.removeEventListener("resize", onResize)
	}

	const observer = new ResizeObserver(() => onResize())
	observer.observe(element)
	window.addEventListener("resize", onResize)

	return () => {
		observer.disconnect()
		window.removeEventListener("resize", onResize)
	}
}
