import { Router } from "express"
import * as exportController from "./export.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { requireScope } from "../../middleware/scope.middleware"
import {
	projectIdFromVersionParam,
	requireProjectRole,
} from "../../middleware/authorize.middleware"

const router = Router()

router.use(authenticateJWT)

router.get(
	"/image/:imageId/report.json",
	requireScope("sculpt:read"),
	exportController.getImageReportJson
)
router.get(
	"/image/:imageId/report.csv",
	requireScope("sculpt:read"),
	exportController.getImageReportCsv
)

router.get(
	"/version/:versionId/markers.edl",
	requireProjectRole("VIEWER", projectIdFromVersionParam()),
	exportController.getVersionMarkersEdl
)
router.get(
	"/version/:versionId/markers.xml",
	requireProjectRole("VIEWER", projectIdFromVersionParam()),
	exportController.getVersionMarkersXml
)

export default router
