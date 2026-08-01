import { Response } from "express"
import { AuthenticatedRequest } from "../../types"
import { updateUserProfile, changeUserPassword } from "./auth.service"
import { deleteAccount, exportAccountData } from "./account.service"
import { prisma } from "../../lib/prisma"
import { respondWithError } from "../../lib/http"
import { NOTIFICATION_PREFERENCE_KEYS } from "../notifications/notification-preferences"
import { recordAudit, requestIp } from "../audit/audit.service"
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
} from "../../lib/cookies"
import { USER_SESSION_LIFETIME_MS, issueSession } from "./session.service"

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
		respondWithError(res, error, "update profile")
	}
}

export const updateNotificationPreferences = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const requested = NOTIFICATION_PREFERENCE_KEYS.filter(
			(key) => typeof req.body[key] === "boolean"
		)
		const user = await prisma.user.update({
			where: { id: req.user!.id },
			data: Object.fromEntries(requested.map((key) => [key, req.body[key]])),
			select: {
				id: true,
				emailNotifications: true,
				emailOnMention: true,
				emailOnComment: true,
				emailOnReply: true,
				emailOnReview: true,
			},
		})
		res.status(200).json(user)
	} catch (error) {
		respondWithError(res, error, "update notification preferences")
	}
}

export const changePassword = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		const { currentPassword, newPassword } = req.body
		await changeUserPassword(userId, currentPassword, newPassword)

		const refreshed = await prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { id: true, tokenVersion: true },
		})
		const { token } = issueSession(refreshed, "user")
		setSessionCookie(res, SESSION_COOKIE, token, USER_SESSION_LIFETIME_MS)

		await recordAudit({
			action: "user.password_changed",
			targetType: "user",
			targetId: userId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(200).json({
			message: "Password updated. Other devices have been signed out.",
		})
	} catch (error) {
		respondWithError(res, error, "change password")
	}
}

export const exportMyData = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		const data = await exportAccountData(userId)

		await recordAudit({
			action: "user.data_exported",
			targetType: "user",
			targetId: userId,
			actorId: userId,
			ipAddress: requestIp(req),
		})

		res.setHeader("Content-Type", "application/json")
		res.setHeader(
			"Content-Disposition",
			'attachment; filename="sculpt-account-export.json"'
		)
		res.status(200).send(JSON.stringify(data, null, 2))
	} catch (error) {
		respondWithError(res, error, "export account data")
	}
}

export const deleteMyAccount = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		await deleteAccount(userId, {
			password: req.body.password,
			transferOrDelete: req.body.deleteOwnedProjects === true,
		})

		await recordAudit({
			action: "user.account_deleted",
			targetType: "user",
			targetId: userId,
			ipAddress: requestIp(req),
		})

		clearSessionCookie(res, SESSION_COOKIE)
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "delete account")
	}
}
