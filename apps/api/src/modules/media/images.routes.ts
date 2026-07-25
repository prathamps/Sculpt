import { Router } from "express"
import * as imageController from "./images.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { upload } from "../../middleware/upload.middleware"

const router = Router()

router.use(authenticateJWT)

router.get("/:id", imageController.getImage)
router.put("/:id", imageController.updateImage)
router.delete("/:id", imageController.deleteImage)

router.get("/versions/:versionId", imageController.getImageVersion)
router.post(
	"/:imageId/versions",
	upload.fields([
		{ name: "image", maxCount: 1 },
		{ name: "thumbnail", maxCount: 1 },
		{ name: "modelProxy", maxCount: 1 },
	]),
	imageController.uploadImageVersion
)
router.put("/versions/:versionId", imageController.updateImageVersion)
router.delete("/versions/:versionId", imageController.deleteImageVersion)

router.get("/versions/:imageVersionId/comments", imageController.getComments)
router.post("/versions/:imageVersionId/comments", imageController.addComment)
router.delete("/comments/:commentId", imageController.deleteComment)
router.post("/comments/:commentId/like", imageController.toggleLikeComment)
router.post(
	"/comments/:commentId/resolve",
	imageController.toggleResolveComment
)

const projectImagesRouter = Router({ mergeParams: true })

projectImagesRouter.use(authenticateJWT)

projectImagesRouter.post(
	"/",
	upload.fields([
		{ name: "images", maxCount: 10 },
		{ name: "thumbnails", maxCount: 10 },
		{ name: "modelProxies", maxCount: 10 },
	]),
	imageController.uploadImage
)
projectImagesRouter.get("/", imageController.getProjectImages)

export { router as imageRouter, projectImagesRouter }
