export interface DiffRegion {
	x: number
	y: number
	width: number
	height: number
}

export interface ImageDiff {
	changedFraction: number
	regions: DiffRegion[]
}

const CHANNELS = 4
const DEFAULT_PIXEL_THRESHOLD = 40
const DEFAULT_CELL_SIZE = 16
const DEFAULT_CELL_FRACTION = 0.03
const DEFAULT_ANALYSIS_SIZE = 768
const MAX_REGIONS = 24

export const diffMask = (
	before: ArrayLike<number>,
	after: ArrayLike<number>,
	width: number,
	height: number,
	threshold = DEFAULT_PIXEL_THRESHOLD
): Uint8Array => {
	const mask = new Uint8Array(width * height)
	for (let pixel = 0; pixel < width * height; pixel++) {
		const offset = pixel * CHANNELS
		const delta =
			Math.abs((before[offset] ?? 0) - (after[offset] ?? 0)) +
			Math.abs((before[offset + 1] ?? 0) - (after[offset + 1] ?? 0)) +
			Math.abs((before[offset + 2] ?? 0) - (after[offset + 2] ?? 0)) +
			Math.abs((before[offset + 3] ?? 0) - (after[offset + 3] ?? 0))
		mask[pixel] = delta > threshold ? 1 : 0
	}
	return mask
}

export const changedRegions = (
	mask: Uint8Array,
	width: number,
	height: number,
	cellSize = DEFAULT_CELL_SIZE,
	minCellFraction = DEFAULT_CELL_FRACTION
): DiffRegion[] => {
	const columns = Math.ceil(width / cellSize)
	const rows = Math.ceil(height / cellSize)
	const changedCells = new Uint8Array(columns * rows)

	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			let changed = 0
			let total = 0
			for (let y = row * cellSize; y < Math.min(height, (row + 1) * cellSize); y++) {
				for (let x = column * cellSize; x < Math.min(width, (column + 1) * cellSize); x++) {
					changed += mask[y * width + x] ?? 0
					total++
				}
			}
			if (total > 0 && changed / total >= minCellFraction) changedCells[row * columns + column] = 1
		}
	}

	const visited = new Uint8Array(columns * rows)
	const regions: DiffRegion[] = []
	for (let start = 0; start < changedCells.length; start++) {
		if (!changedCells[start] || visited[start]) continue
		let minColumn = columns
		let maxColumn = -1
		let minRow = rows
		let maxRow = -1
		const stack = [start]
		visited[start] = 1
		while (stack.length > 0) {
			const cell = stack.pop() as number
			const column = cell % columns
			const row = Math.floor(cell / columns)
			minColumn = Math.min(minColumn, column)
			maxColumn = Math.max(maxColumn, column)
			minRow = Math.min(minRow, row)
			maxRow = Math.max(maxRow, row)
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nextColumn = column + dx
					const nextRow = row + dy
					if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue
					const next = nextRow * columns + nextColumn
					if (changedCells[next] && !visited[next]) {
						visited[next] = 1
						stack.push(next)
					}
				}
			}
		}
		regions.push({
			x: (minColumn * cellSize) / width,
			y: (minRow * cellSize) / height,
			width: (Math.min(width, (maxColumn + 1) * cellSize) - minColumn * cellSize) / width,
			height: (Math.min(height, (maxRow + 1) * cellSize) - minRow * cellSize) / height,
		})
	}

	return regions
		.sort((a, b) => b.width * b.height - a.width * a.height)
		.slice(0, MAX_REGIONS)
}

export const analysisSize = (
	naturalWidth: number,
	naturalHeight: number,
	maxSize = DEFAULT_ANALYSIS_SIZE
): { width: number; height: number } => {
	const scale = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight, 1))
	return {
		width: Math.max(1, Math.round(naturalWidth * scale)),
		height: Math.max(1, Math.round(naturalHeight * scale)),
	}
}

const pixelsOf = (image: HTMLImageElement, width: number, height: number): Uint8ClampedArray => {
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext("2d", { willReadFrequently: true })
	if (!context) throw new Error("Canvas is not available")
	context.drawImage(image, 0, 0, width, height)
	return context.getImageData(0, 0, width, height).data
}

export const diffImages = (before: HTMLImageElement, after: HTMLImageElement): ImageDiff => {
	const { width, height } = analysisSize(before.naturalWidth, before.naturalHeight)
	const mask = diffMask(pixelsOf(before, width, height), pixelsOf(after, width, height), width, height)
	const changed = mask.reduce((sum, value) => sum + value, 0)
	return {
		changedFraction: changed / (width * height),
		regions: changedRegions(mask, width, height),
	}
}
