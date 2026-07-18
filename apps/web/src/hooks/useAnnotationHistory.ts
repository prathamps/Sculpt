"use client"

import { useState, useCallback } from "react"
import { Annotation } from "@/types"

// Working (unsent) drawings with linear undo/redo history.
export function useAnnotationHistory() {
	const [annotations, setAnnotations] = useState<Annotation[]>([])
	const [currentAnnotation, setCurrentAnnotation] =
		useState<Annotation | null>(null)
	const [history, setHistory] = useState<Annotation[][]>([[]])
	const [historyIndex, setHistoryIndex] = useState(0)

	const addAnnotation = useCallback(
		(newAnnotation: Omit<Annotation, "id">) => {
			const annotationWithId = { ...newAnnotation, id: Date.now() }
			setCurrentAnnotation(annotationWithId)
			setAnnotations((prev) => {
				const nextAnnotations = [...prev, annotationWithId]
				setHistory((prevHistory) => {
					const newHistory = prevHistory.slice(0, historyIndex + 1)
					newHistory.push(nextAnnotations)
					setHistoryIndex(newHistory.length - 1)
					return newHistory
				})
				return nextAnnotations
			})
			return annotationWithId
		},
		[historyIndex]
	)

	const undo = useCallback(() => {
		if (historyIndex > 0) {
			const newIndex = historyIndex - 1
			setHistoryIndex(newIndex)
			setAnnotations(history[newIndex] || [])
		}
	}, [history, historyIndex])

	const redo = useCallback(() => {
		if (historyIndex < history.length - 1) {
			const newIndex = historyIndex + 1
			setHistoryIndex(newIndex)
			setAnnotations(history[newIndex] || [])
		}
	}, [history, historyIndex])

	const clear = useCallback(() => {
		setAnnotations([])
		setCurrentAnnotation(null)
		setHistory([[]])
		setHistoryIndex(0)
	}, [])

	return {
		annotations,
		currentAnnotation,
		setCurrentAnnotation,
		addAnnotation,
		undo,
		redo,
		clear,
		canUndo: historyIndex > 0,
		canRedo: historyIndex < history.length - 1,
	}
}
