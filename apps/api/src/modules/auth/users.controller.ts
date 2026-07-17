import { Response } from "express"
import { AuthenticatedRequest } from "../../types"
import { updateUserProfile, changeUserPassword } from "./auth.service"
import { AppError } from "../../lib/errors"
import { recordAudit, requestIp } from "../audit/audit.service"

export const updateProfile = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { name, avatarUrl } = req.body
		const user = await updateUserProfile(req.user!.id, { name, avatarUrl })
		await recordAudit({
			action: "user.profile_updated",
			targetType: "user",
			targetId: req.user!.id,
			actorId: req.user!.id,
			ipAddress: requestIp(req),
		})
		res.status(200).json(user)
	} catch (error) {
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
			return
		}
		res.status(500).json({ message: "Error updating profile" })
	}
}

export const changePassword = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { currentPassword, newPassword } = req.body
		await changeUserPassword(req.user!.id, currentPassword, newPassword)
		await recordAudit({
			action: "user.password_changed",
			targetType: "user",
			targetId: req.user!.id,
			actorId: req.user!.id,
			ipAddress: requestIp(req),
		})
		res.status(200).json({ message: "Password updated successfully" })
	} catch (error) {
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
			return
		}
		res.status(500).json({ message: "Error changing password" })
	}
}
