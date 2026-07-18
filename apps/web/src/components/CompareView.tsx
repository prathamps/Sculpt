"use client"

import { ComparePane } from "./ComparePane"
import { ImageVersion } from "@/types"

interface CompareViewProps {
	versions: ImageVersion[]
	leftVersion: ImageVersion
	rightVersion: ImageVersion
	onLeftChange: (version: ImageVersion) => void
	onRightChange: (version: ImageVersion) => void
}

// Side-by-side (stacked on small screens) read-only comparison of two
// versions of the same file.
export function CompareView({
	versions,
	leftVersion,
	rightVersion,
	onLeftChange,
	onRightChange,
}: CompareViewProps) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden md:flex-row">
			<ComparePane
				label="A"
				version={leftVersion}
				versions={versions}
				onVersionChange={onLeftChange}
			/>
			<div
				className="border-t border-border md:border-l md:border-t-0"
				aria-hidden="true"
			/>
			<ComparePane
				label="B"
				version={rightVersion}
				versions={versions}
				onVersionChange={onRightChange}
			/>
		</div>
	)
}
