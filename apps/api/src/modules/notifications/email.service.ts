import nodemailer, { Transporter } from "nodemailer"
import { JsonValue } from "@prisma/client/runtime/library"
import { logger } from "../../lib/logger"

const FRONTEND_URL = (
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"
).replace(/\/+$/, "")

const FROM = process.env.SMTP_FROM || "Sculpt <no-reply@sculpt.app>"

let transporter: Transporter | null = null

if (process.env.SMTP_HOST) {
	transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: process.env.SMTP_SECURE === "true",
		auth: process.env.SMTP_USER
			? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
			: undefined,
	})
	logger.info("SMTP transport configured")
}

export const isEmailConfigured = (): boolean => transporter !== null

const HTML_ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
}

export const escapeHtml = (value: string): string =>
	value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character])

interface SendEmailInput {
	to: string
	subject: string
	html: string
	text?: string
}

export const sendEmail = async (input: SendEmailInput): Promise<void> => {
	if (!transporter) {
		logger.debug("Email skipped because SMTP is not configured", {
			subject: input.subject,
		})
		return
	}
	try {
		await transporter.sendMail({
			from: FROM,
			to: input.to,
			subject: input.subject,
			text: input.text,
			html: input.html,
		})
		logger.info("Email sent", { subject: input.subject })
	} catch (error) {
		logger.error("Email send failed", error, { subject: input.subject })
	}
}

const buildLink = (metadata?: JsonValue): string => {
	if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
		const fields = metadata as Record<string, unknown>
		if (
			typeof fields.projectId === "string" &&
			typeof fields.imageId === "string"
		) {
			return `${FRONTEND_URL}/project/${fields.projectId}/image/${fields.imageId}`
		}
		if (typeof fields.projectId === "string") {
			return `${FRONTEND_URL}/project/${fields.projectId}`
		}
	}
	return `${FRONTEND_URL}/dashboard`
}

const layout = (bodyHtml: string, footer: string): string => `
	<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
		<h2 style="font-size: 18px; margin-bottom: 8px;">Sculpt</h2>
		${bodyHtml}
		<p style="color:#888; font-size:12px;">${footer}</p>
	</div>`

const actionButton = (href: string, label: string): string => `
	<p style="margin: 24px 0;">
		<a href="${escapeHtml(href)}" style="background:#4783E8; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none; font-size:14px;">${escapeHtml(label)}</a>
	</p>`

export const sendNotificationEmail = async (data: {
	to: string
	name?: string | null
	content: string
	subject?: string
	metadata?: JsonValue
}): Promise<void> => {
	const link = buildLink(data.metadata)
	const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : "Hi,"

	const html = layout(
		`<p style="color:#444;">${greeting}</p>
		<p style="font-size: 15px; line-height: 1.5;">${escapeHtml(data.content)}</p>
		${actionButton(link, "Open in Sculpt")}`,
		"You're receiving this because you were offline when this happened on Sculpt."
	)

	await sendEmail({
		to: data.to,
		subject: data.subject || "New activity on Sculpt",
		html,
		text: `${data.name ? `Hi ${data.name},` : "Hi,"}\n\n${data.content}\n\nOpen in Sculpt: ${link}`,
	})
}

export const sendPasswordResetEmail = async (data: {
	to: string
	name?: string | null
	resetUrl: string
}): Promise<void> => {
	const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : "Hi,"

	const html = layout(
		`<p style="color:#444;">${greeting}</p>
		<p style="font-size: 15px; line-height: 1.5;">Someone asked to reset the password for your Sculpt account. This link expires in one hour.</p>
		${actionButton(data.resetUrl, "Choose a new password")}
		<p style="font-size: 13px; color:#666;">If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>`,
		"This link can only be used once."
	)

	await sendEmail({
		to: data.to,
		subject: "Reset your Sculpt password",
		html,
		text: `${data.name ? `Hi ${data.name},` : "Hi,"}\n\nReset your Sculpt password (link expires in one hour):\n${data.resetUrl}\n\nIf you didn't request this, ignore this email.`,
	})
}

export const sendProjectInvitationEmail = async (data: {
	to: string
	inviterName: string | null
	projectName: string
	acceptUrl: string
	isExistingUser: boolean
}): Promise<void> => {
	const inviter = data.inviterName
		? escapeHtml(data.inviterName)
		: "A Sculpt user"

	const html = layout(
		`<p style="font-size: 15px; line-height: 1.5;">${inviter} invited you to review <strong>${escapeHtml(data.projectName)}</strong> on Sculpt.</p>
		${actionButton(data.acceptUrl, data.isExistingUser ? "Open the project" : "Create your account")}
		${
			data.isExistingUser
				? ""
				: `<p style="font-size: 13px; color:#666;">You'll be asked to pick a password, then you'll land straight in the project.</p>`
		}`,
		"If you weren't expecting this invitation you can ignore this email."
	)

	await sendEmail({
		to: data.to,
		subject: `${data.inviterName || "Someone"} invited you to ${data.projectName}`,
		html,
		text: `${data.inviterName || "A Sculpt user"} invited you to review ${data.projectName} on Sculpt.\n\n${data.acceptUrl}`,
	})
}
