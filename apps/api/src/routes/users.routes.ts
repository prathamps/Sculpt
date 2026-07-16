import { Router, Request, Response } from "express"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = Router()

router.get("/profile", authenticateJWT, (req: Request, res: Response) => {
	res.json(req.user)
})

// Alias — the documented endpoint for the authenticated user's profile.
router.get("/me", authenticateJWT, (req: Request, res: Response) => {
	res.json(req.user)
})

export default router
