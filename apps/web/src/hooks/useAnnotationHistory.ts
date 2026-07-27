"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Annotation } from "@/types"

interface HistoryState {
	stack: Annotation[][]
	index: number
}

const INITIAL_HISTORY: HistoryState = { stack: [[]], index: 0 }

export function useAnnotationHistory() {
	const [history, setHistory] = useState<HistoryState>(INITIAL_HISTORY)
	const [currentAnnotation, setCurrentAnnotation] =
		useState<Annotation | null>(null)
	const nextIdRef = useRef(0)

	const annotations = useMemo(
		() => history.stack[history.index] ?? [],
		[history]
	)

	const addAnnotation = useCallback(
		(newAnnotation: Omit<Annotation, "id">) => {
			nextIdRef.current += 1
			const annotationWithId = { ...newAnnotation, id: nextIdRef.current }

			setCurrentAnnotation(annotationWithId)
			setHistory((previous) => {
				const base = previous.stack[previous.index] ?? []
				const kept = previous.stack.slice(0, previous.index + 1)
				return {
					stack: [...kept, [...base, annotationWithId]],
					index: kept.length,
				}
			})

			return annotationWithId
		},
		[]
	)

	const undo = useCallback(() => {
		setHistory((previous) =>
			previous.index > 0
				? { ...previous, index: previous.index - 1 }
				: previous
		)
	}, [])

	const redo = useCallback(() => {
		setHistory((previous) =>
			previous.index < previous.stack.length - 1
				? { ...previous, index: previous.index + 1 }
				: previous
		)
	}, [])

	const clear = useCallback(() => {
		setHistory(INITIAL_HISTORY)
		setCurrentAnnotation(null)
	}, [])

	return {
		annotations,
		currentAnnotation,
		setCurrentAnnotation,
		addAnnotation,
		undo,
		redo,
		clear,
		canUndo: history.index > 0,
		canRedo: history.index < history.stack.length - 1,
	}
}
