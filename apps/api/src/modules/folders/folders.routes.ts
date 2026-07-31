import { Router } from "express"
import * as folderController from "./folders.controller"
import {
	projectIdFromParam,
	requireProjectRole,
} from "../../middleware/authorize.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import {
	createFolderSchema,
	moveFolderSchema,
	moveImageSchema,
	moveImagesSchema,
	renameFolderSchema,
} from "./folders.schema"

const projectFoldersRouter = Router({ mergeParams: true })

const onProject = (minimum: "VIEWER" | "EDITOR") =>
	requireProjectRole(minimum, projectIdFromParam("projectId"))

projectFoldersRouter.get("/", onProject("VIEWER"), folderController.listFolders)
projectFoldersRouter.get(
	"/:folderId/path",
	onProject("VIEWER"),
	folderController.getFolderPath
)
projectFoldersRouter.post(
	"/",
	onProject("EDITOR"),
	validateBody(createFolderSchema),
	folderController.createFolder
)
projectFoldersRouter.patch(
	"/:folderId",
	onProject("EDITOR"),
	validateBody(renameFolderSchema),
	folderController.renameFolder
)
projectFoldersRouter.patch(
	"/:folderId/parent",
	onProject("EDITOR"),
	validateBody(moveFolderSchema),
	folderController.moveFolder
)
projectFoldersRouter.delete(
	"/:folderId",
	onProject("EDITOR"),
	folderController.deleteFolder
)

const projectImageFolderRouter = Router({ mergeParams: true })

projectImageFolderRouter.patch(
	"/folder",
	requireProjectRole("EDITOR", projectIdFromParam("projectId")),
	validateBody(moveImagesSchema),
	folderController.moveImages
)
projectImageFolderRouter.patch(
	"/:imageId/folder",
	requireProjectRole("EDITOR", projectIdFromParam("projectId")),
	validateBody(moveImageSchema),
	folderController.moveImage
)

export { projectFoldersRouter, projectImageFolderRouter }
