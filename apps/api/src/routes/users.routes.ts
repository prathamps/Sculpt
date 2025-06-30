import { Router, Request, Response } from "express"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = Router()

router.get("/profile", authenticateJWT, (req: Request, res: Response) => {
	res.json(req.user)
})

export default router
