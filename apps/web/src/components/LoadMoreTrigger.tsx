"use client"

import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "./ui/button"

interface LoadMoreTriggerProps {
	onLoadMore: () => void
	isLoading: boolean
	label: string
}

const PREFETCH_MARGIN = "400px"

export function LoadMoreTrigger({ onLoadMore, isLoading, label }: LoadMoreTriggerProps) {
	const buttonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		const target = buttonRef.current
		if (!target || typeof IntersectionObserver === "undefined") return
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
			},
			{ rootMargin: PREFETCH_MARGIN }
		)
		observer.observe(target)
		return () => observer.disconnect()
	}, [onLoadMore])

	return (
		<div className="flex justify-center pt-6">
			<Button
				ref={buttonRef}
				variant="outline"
				size="sm"
				onClick={onLoadMore}
				disabled={isLoading}
				aria-busy={isLoading}
			>
				{isLoading && (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
				)}
				{label}
			</Button>
		</div>
	)
}
