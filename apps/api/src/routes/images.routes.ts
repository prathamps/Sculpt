import { Router } from "express"
import * as imageController from "../controllers/images.controller"
import { authenticateJWT } from "../middleware/auth.middleware"
import { upload } from "../middleware/upload.middleware"

const router = Router()

router.use(authenticateJWT)

// These routes are scoped under /api/images
router.get("/:id", imageController.getImage)
router.put("/:id", imageController.updateImage)
router.delete("/:id", imageController.deleteImage)

// The following routes were originally in projects.routes.ts
// They are now moved here and will be mounted under /api/projects
const projectImagesRouter = Router({ mergeParams: true })

projectImagesRouter.use(authenticateJWT)

projectImagesRouter.post(
	"/",
	upload.array("images", 10),
	imageController.uploadImage
)
projectImagesRouter.get("/", imageController.getProjectImages)

export { router as imageRouter, projectImagesRouter }
