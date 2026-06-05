import { Router } from "express"
import * as exportController from "../controllers/export.controller"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = Router()

router.use(authenticateJWT)

router.get("/image/:imageId/report.json", exportController.getImageReportJson)
router.get("/image/:imageId/report.csv", exportController.getImageReportCsv)

export default router
