import { z } from "zod"
import { ReviewDecision } from "@prisma/client"

const MAX_NOTE_LENGTH = 2000

export const recordDecisionSchema = z.object({
	decision: z.enum([
		ReviewDecision.APPROVED,
		ReviewDecision.CHANGES_REQUESTED,
	]),
	note: z.string().trim().max(MAX_NOTE_LENGTH).nullish(),
})

export const setDueDateSchema = z.object({
	dueAt: z.coerce.date().nullish(),
})
