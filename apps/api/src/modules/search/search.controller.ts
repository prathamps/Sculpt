import { Request, Response } from "express"
import { MediaType, ReviewStatus } from "@prisma/client"
import { AuthenticatedUser } from "../../types"
import { respondWithError } from "../../lib/http"
import { SEARCH_RESULT_LIMIT, searchForUser } from "./search.service"

export const search = async (req: Request, res: Response): Promise<void> => {
	try {
		const userId = (req.user as AuthenticatedUser).id
		const { q, limit, mediaType, reviewStatus } = res.locals.query as {
			q: string
			limit: number
			mediaType?: MediaType
			reviewStatus?: ReviewStatus
		}
		const results = await searchForUser(
			userId,
			q,
			Math.min(limit || SEARCH_RESULT_LIMIT, SEARCH_RESULT_LIMIT),
			{ mediaType, reviewStatus }
		)
		res.status(200).json(results)
	} catch (error) {
		respondWithError(res, error, "search")
	}
}
