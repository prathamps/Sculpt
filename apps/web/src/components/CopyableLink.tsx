"use client"

import { useEffect, useState } from "react"
import { Check, ClipboardCopy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const COPIED_FEEDBACK_MS = 2000

interface CopyableLinkProps {
	url: string
	label: string
}

export function CopyableLink({ url, label }: CopyableLinkProps) {
	const [hasCopied, setHasCopied] = useState(false)

	useEffect(() => {
		if (!hasCopied) return
		const timer = setTimeout(() => setHasCopied(false), COPIED_FEEDBACK_MS)
		return () => clearTimeout(timer)
	}, [hasCopied])

	useEffect(() => setHasCopied(false), [url])

	const copy = async () => {
		await navigator.clipboard.writeText(url)
		setHasCopied(true)
	}

	return (
		<div className="flex items-center gap-2">
			<Input
				readOnly
				value={url}
				aria-label={label}
				className="h-8 font-mono text-xs"
				onFocus={(event) => event.currentTarget.select()}
			/>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-8 shrink-0 gap-1"
				onClick={() => void copy()}
			>
				{hasCopied ? (
					<Check className="h-3.5 w-3.5" aria-hidden="true" />
				) : (
					<ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
				)}
				{hasCopied ? "Copied" : "Copy"}
			</Button>
		</div>
	)
}
