"use client"

import { useState, useRef, useEffect, useCallback } from "react"

interface UseRovingGridOptions {
	itemCount: number
	onActivate: (index: number) => void
}

export function useRovingGrid<T extends HTMLElement>({
	itemCount,
	onActivate,
}: UseRovingGridOptions) {
	const [activeIndex, setActiveIndex] = useState(0)
	const itemRefs = useRef<(T | null)[]>([])

	useEffect(() => {
		itemRefs.current = itemRefs.current.slice(0, itemCount)
		if (activeIndex >= itemCount) {
			setActiveIndex(Math.max(0, itemCount - 1))
		}
	}, [itemCount, activeIndex])

	const measureColumnCountFromLayout = useCallback((): number => {
		const items = itemRefs.current.filter(Boolean) as T[]
		if (items.length === 0) return 1
		const firstTop = items[0].offsetTop
		let columns = 0
		for (const item of items) {
			if (item.offsetTop !== firstTop) break
			columns++
		}
		return Math.max(1, columns)
	}, [])

	const focusIndex = useCallback(
		(index: number) => {
			const clamped = Math.min(Math.max(index, 0), itemCount - 1)
			setActiveIndex(clamped)
			itemRefs.current[clamped]?.focus()
		},
		[itemCount]
	)

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent, index: number) => {
			if (!(event.target as HTMLElement).hasAttribute("data-roving-item")) {
				return
			}
			let next: number | null = null
			switch (event.key) {
				case "ArrowRight":
					next = index + 1
					break
				case "ArrowLeft":
					next = index - 1
					break
				case "ArrowDown":
					next = index + measureColumnCountFromLayout()
					break
				case "ArrowUp":
					next = index - measureColumnCountFromLayout()
					break
				case "Home":
					next = 0
					break
				case "End":
					next = itemCount - 1
					break
				case "Enter":
				case " ":
					event.preventDefault()
					onActivate(index)
					return
				default:
					return
			}
			event.preventDefault()
			if (next !== null && next >= 0 && next < itemCount) focusIndex(next)
		},
		[measureColumnCountFromLayout, focusIndex, itemCount, onActivate]
	)

	const getItemProps = useCallback(
		(index: number) => ({
			ref: (el: T | null) => {
				itemRefs.current[index] = el
			},
			tabIndex: index === activeIndex ? 0 : -1,
			"data-roving-item": "",
			onFocus: () => setActiveIndex(index),
			onKeyDown: (event: React.KeyboardEvent) => handleKeyDown(event, index),
		}),
		[activeIndex, handleKeyDown]
	)

	return { activeIndex, getItemProps }
}
