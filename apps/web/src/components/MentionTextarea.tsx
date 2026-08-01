"use client"

import { useMemo, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/UserAvatar"
import { useProjectMembers } from "@/context/ProjectMembersContext"
import { useAuth } from "@/context/AuthContext"
import { cn } from "@/lib/utils"

export interface MentionPick {
	id: string
	label: string
}

export const mentionLabelOf = (user: {
	name: string | null
	email: string
}): string => user.name || user.email.split("@")[0] || user.email

interface MentionTextareaProps {
	id?: string
	value: string
	onChange: (value: string) => void
	onMentionPicked: (pick: MentionPick) => void
	placeholder?: string
	className?: string
	ariaLabel?: string
}

interface ActiveToken {
	start: number
	query: string
}

const MAX_SUGGESTIONS = 5

const activeTokenAt = (text: string, caret: number): ActiveToken | null => {
	const beforeCaret = text.slice(0, caret)
	const atIndex = beforeCaret.lastIndexOf("@")
	if (atIndex === -1) return null
	if (atIndex > 0 && !/\s/.test(beforeCaret.charAt(atIndex - 1))) return null
	const query = beforeCaret.slice(atIndex + 1)
	if (query.includes("\n") || query.length > 40) return null
	return { start: atIndex, query }
}

export function MentionTextarea({
	id,
	value,
	onChange,
	onMentionPicked,
	placeholder,
	className,
	ariaLabel,
}: MentionTextareaProps) {
	const members = useProjectMembers()
	const { user: currentUser } = useAuth()
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [token, setToken] = useState<ActiveToken | null>(null)
	const [highlighted, setHighlighted] = useState(0)

	const suggestions = useMemo(() => {
		if (!token) return []
		const query = token.query.toLowerCase()
		return members
			.filter((member) => member.user.id !== currentUser?.id)
			.filter((member) => {
				const label = mentionLabelOf(member.user).toLowerCase()
				return label.startsWith(query) || member.user.email.toLowerCase().startsWith(query)
			})
			.slice(0, MAX_SUGGESTIONS)
	}, [members, token, currentUser?.id])

	const isOpen = token !== null && suggestions.length > 0

	const refreshToken = (nextValue: string, caret: number | null) => {
		const nextToken = caret === null ? null : activeTokenAt(nextValue, caret)
		setToken(nextToken)
		setHighlighted(0)
	}

	const pick = (member: (typeof suggestions)[number]) => {
		if (!token) return
		const label = mentionLabelOf(member.user)
		const caret = textareaRef.current?.selectionStart ?? value.length
		const nextValue = `${value.slice(0, token.start)}@${label} ${value.slice(caret)}`
		onChange(nextValue)
		onMentionPicked({ id: member.user.id, label })
		setToken(null)
		requestAnimationFrame(() => {
			const el = textareaRef.current
			if (!el) return
			const nextCaret = token.start + label.length + 2
			el.focus()
			el.setSelectionRange(nextCaret, nextCaret)
		})
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (!isOpen) return
		if (e.key === "ArrowDown") {
			e.preventDefault()
			setHighlighted((index) => (index + 1) % suggestions.length)
		} else if (e.key === "ArrowUp") {
			e.preventDefault()
			setHighlighted(
				(index) => (index - 1 + suggestions.length) % suggestions.length
			)
		} else if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault()
			const highlightedMember = suggestions[highlighted]
			if (highlightedMember) pick(highlightedMember)
		} else if (e.key === "Escape") {
			e.preventDefault()
			setToken(null)
		}
	}

	return (
		<div className="relative">
			{isOpen && (
				<ul
					id={id ? `${id}-mention-list` : undefined}
					role="listbox"
					aria-label="Mention a project member"
					className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
				>
					{suggestions.map((member, index) => (
						<li
							key={member.user.id}
							role="option"
							aria-selected={index === highlighted}
							className={cn(
								"flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm",
								index === highlighted
									? "bg-accent text-accent-foreground"
									: "text-foreground"
							)}
							onMouseDown={(e) => {
								e.preventDefault()
								pick(member)
							}}
							onMouseEnter={() => setHighlighted(index)}
						>
							<UserAvatar
								className="h-5 w-5"
								fallbackClassName="text-[9px]"
								name={member.user.name}
								email={member.user.email}
								avatarUrl={member.user.avatarUrl}
							/>
							<span className="truncate">{mentionLabelOf(member.user)}</span>
							<span className="ml-auto truncate text-xs text-muted-foreground">
								{member.user.email}
							</span>
						</li>
					))}
				</ul>
			)}
			<Textarea
				id={id}
				ref={textareaRef}
				value={value}
				placeholder={placeholder}
				className={className}
				aria-label={ariaLabel}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={isOpen}
				aria-controls={id ? `${id}-mention-list` : undefined}
				onChange={(e) => {
					onChange(e.target.value)
					refreshToken(e.target.value, e.target.selectionStart)
				}}
				onKeyDown={handleKeyDown}
				onClick={(e) =>
					refreshToken(value, (e.target as HTMLTextAreaElement).selectionStart)
				}
				onBlur={() => setToken(null)}
			/>
		</div>
	)
}
