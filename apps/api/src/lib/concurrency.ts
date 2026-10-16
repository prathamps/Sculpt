export const forEachConcurrently = async <T>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<void>
): Promise<void> => {
	let next = 0
	const worker = async (): Promise<void> => {
		while (next < items.length) {
			const item = items[next++]
			await task(item)
		}
	}
	const workers = Math.max(1, Math.min(limit, items.length))
	await Promise.all(Array.from({ length: workers }, worker))
}
