const DEFAULT_MAX_ENTRIES = 10000

interface Entry<V> {
	value: V
	expiresAt: number
}

export class TtlCache<V> {
	private readonly entries = new Map<string, Entry<V>>()

	constructor(
		private readonly ttlMs: number,
		private readonly maxEntries = DEFAULT_MAX_ENTRIES,
		private readonly now: () => number = Date.now
	) {}

	get(key: string): V | undefined {
		const entry = this.entries.get(key)
		if (!entry) return undefined
		if (entry.expiresAt <= this.now()) {
			this.entries.delete(key)
			return undefined
		}
		return entry.value
	}

	set(key: string, value: V): void {
		this.entries.delete(key)
		this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
		this.evictOverflow()
	}

	delete(key: string): void {
		this.entries.delete(key)
	}

	deleteWhere(matches: (value: V, key: string) => boolean): void {
		for (const [key, entry] of this.entries) {
			if (matches(entry.value, key)) this.entries.delete(key)
		}
	}

	clear(): void {
		this.entries.clear()
	}

	get size(): number {
		return this.entries.size
	}

	private evictOverflow(): void {
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value
			if (oldest === undefined) return
			this.entries.delete(oldest)
		}
	}
}

export const cachePositive = async <V>(
	cache: TtlCache<V>,
	key: string,
	load: () => Promise<V | null>
): Promise<V | null> => {
	const cached = cache.get(key)
	if (cached !== undefined) return cached
	const loaded = await load()
	if (loaded !== null) cache.set(key, loaded)
	return loaded
}
