import { Router, Request, Response } from "express"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { updateProfile, changePassword } from "./users.controller"

const router = Router()

router.use(authenticateJWT)

router.get("/profile", (req: Request, res: Response) => {
	res.json(req.user)
})

router.get("/me", (req: Request, res: Response) => {
	res.json(req.user)
})

router.patch("/me", updateProfile)
router.post("/me/password", changePassword)

export default router
