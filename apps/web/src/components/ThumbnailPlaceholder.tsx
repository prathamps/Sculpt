import { ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThumbnailPlaceholder({ iconSize = "h-10 w-10" }: { iconSize?: string }) {
	return (
		<div className="flex h-full w-full items-center justify-center bg-muted">
			<ImageIcon className={cn(iconSize, "text-muted-foreground")} aria-hidden="true" />
		</div>
	)
}
