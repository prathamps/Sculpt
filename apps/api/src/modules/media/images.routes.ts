import { Router } from "express"
import * as imageController from "./images.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import {
	projectIdFromImageParam,
	projectIdFromParam,
	projectIdFromVersionParam,
	requireProjectRole,
} from "../../middleware/authorize.middleware"
import {
	discardStagedUploadsWhenRequestEnds,
	upload,
} from "../../middleware/upload.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import { renameImageSchema, renameVersionSchema } from "./media.schema"
import commentsRouter from "../comments/comments.routes"
import { versionReviewRouter } from "../reviews/reviews.routes"

const router = Router()

router.use(authenticateJWT)

const onImage = (minimum: "VIEWER" | "EDITOR", param = "id") =>
	requireProjectRole(minimum, projectIdFromImageParam(param))

const onVersion = (minimum: "VIEWER" | "EDITOR", param = "versionId") =>
	requireProjectRole(minimum, projectIdFromVersionParam(param))

router.get("/:id", onImage("VIEWER"), imageController.getImage)
router.put(
	"/:id",
	onImage("EDITOR"),
	validateBody(renameImageSchema),
	imageController.updateImage
)
router.delete("/:id", onImage("EDITOR"), imageController.deleteImage)

router.get("/versions/:versionId", onVersion("VIEWER"), imageController.getImageVersion)
router.get(
	"/versions/:versionId/download",
	onVersion("VIEWER"),
	imageController.downloadOriginal
)
router.post(
	"/:imageId/versions",
	onImage("EDITOR", "imageId"),
	discardStagedUploadsWhenRequestEnds,
	upload.fields([
		{ name: "image", maxCount: 1 },
		{ name: "thumbnail", maxCount: 1 },
		{ name: "modelProxy", maxCount: 1 },
	]),
	imageController.uploadImageVersion
)
router.put(
	"/versions/:versionId",
	onVersion("EDITOR"),
	validateBody(renameVersionSchema),
	imageController.updateImageVersion
)
router.delete(
	"/versions/:versionId",
	onVersion("EDITOR"),
	imageController.deleteImageVersion
)

router.use("/", commentsRouter)
router.use("/", versionReviewRouter)

const projectImagesRouter = Router({ mergeParams: true })

projectImagesRouter.use(authenticateJWT)

projectImagesRouter.post(
	"/",
	requireProjectRole("EDITOR", projectIdFromParam("projectId")),
	discardStagedUploadsWhenRequestEnds,
	upload.fields([
		{ name: "images", maxCount: 10 },
		{ name: "thumbnails", maxCount: 10 },
		{ name: "modelProxies", maxCount: 10 },
	]),
	imageController.uploadImage
)
projectImagesRouter.get(
	"/",
	requireProjectRole("VIEWER", projectIdFromParam("projectId")),
	imageController.getProjectImages
)

export { router as imageRouter, projectImagesRouter }
