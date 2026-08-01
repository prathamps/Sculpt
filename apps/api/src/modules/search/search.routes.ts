import { Router } from "express"
import { z } from "zod"
import { search } from "./search.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { validateQuery } from "../../middleware/validate.middleware"
import { SEARCH_RESULT_LIMIT } from "./search.service"

const searchQuerySchema = z.object({
	q: z.string().trim().min(1, "Search term is required").max(200),
	limit: z.coerce.number().int().positive().max(SEARCH_RESULT_LIMIT).optional(),
	mediaType: z.enum(["IMAGE", "VIDEO", "PDF", "MODEL"]).optional(),
	reviewStatus: z
		.enum(["PENDING", "CHANGES_REQUESTED", "APPROVED"])
		.optional(),
})

const router = Router()

router.use(authenticateJWT)
router.get("/", validateQuery(searchQuerySchema), search)

export default router
