import { Router } from "express"
import { getImage } from "../controllers/images.controller"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = Router()

router.use(authenticateJWT)

router.get("/:id", getImage)

// I will add a route to get an image by id here later
// router.get("/:id", imageController.getImage)

export default router
