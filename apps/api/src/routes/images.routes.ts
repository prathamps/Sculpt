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

// Version routes
router.get("/versions/:versionId", imageController.getImageVersion)
router.post(
	"/:imageId/versions",
	upload.single("image"),
	imageController.uploadImageVersion
)
router.put("/versions/:versionId", imageController.updateImageVersion)
router.delete("/versions/:versionId", imageController.deleteImageVersion)

// Comment routes
router.get("/versions/:imageVersionId/comments", imageController.getComments)
router.post("/versions/:imageVersionId/comments", imageController.addComment)
router.delete("/comments/:commentId", imageController.deleteComment)
router.post("/comments/:commentId/like", imageController.toggleLikeComment)
router.post(
	"/comments/:commentId/resolve",
	imageController.toggleResolveComment
)

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
