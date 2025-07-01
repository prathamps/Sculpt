"use client"

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmationModalProps {
	isOpen: boolean
	onClose: () => void
	onConfirm: () => void
	title: string
	description: string
	confirmText?: string
	isConfirming?: boolean
}

export function ConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmText = "Delete",
	isConfirming = false,
}: ConfirmationModalProps) {
	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[425px] bg-gray-900 text-white border-gray-800">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button onClick={onClose} variant="secondary" type="button">
						Cancel
					</Button>
					<Button
						onClick={onConfirm}
						variant="destructive"
						disabled={isConfirming}
					>
						{isConfirming ? "Deleting..." : confirmText}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
