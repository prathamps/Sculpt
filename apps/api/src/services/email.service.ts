import nodemailer, { Transporter } from "nodemailer"
import { JsonValue } from "@prisma/client/runtime/library"

const FRONTEND_URL =
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"

const FROM = process.env.SMTP_FROM || "Sculpt <no-reply@sculpt.app>"

// Email is optional. When SMTP isn't configured we no-op (and log) so the app
// runs fine locally / in the FREE tier without an email provider.
let transporter: Transporter | null = null

if (process.env.SMTP_HOST) {
	transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
		auth: process.env.SMTP_USER
			? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
			: undefined,
	})
	console.log("[email] SMTP transport configured")
}

export const isEmailConfigured = (): boolean => transporter !== null

interface SendEmailInput {
	to: string
	subject: string
	html: string
	text?: string
}

export const sendEmail = async (input: SendEmailInput): Promise<void> => {
	if (!transporter) {
		console.log(
			`[email] (skipped — SMTP not configured) to=${input.to} subject="${input.subject}"`
		)
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
		console.log(`[email] sent to ${input.to}: "${input.subject}"`)
	} catch (error) {
		// Never let email failures break the request flow.
		console.error("[email] send failed:", error)
	}
}

// Build a deep link from notification metadata so the email points at the
// relevant project/image when possible.
const buildLink = (metadata?: JsonValue): string => {
	if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
		const m = metadata as Record<string, unknown>
		if (typeof m.projectId === "string" && typeof m.imageId === "string") {
			return `${FRONTEND_URL}/project/${m.projectId}/image/${m.imageId}`
		}
		if (typeof m.projectId === "string") {
			return `${FRONTEND_URL}/project/${m.projectId}`
		}
	}
	return `${FRONTEND_URL}/dashboard`
}

export const sendNotificationEmail = async (data: {
	to: string
	name?: string | null
	content: string
	metadata?: JsonValue
}): Promise<void> => {
	const link = buildLink(data.metadata)
	const greeting = data.name ? `Hi ${data.name},` : "Hi,"
	const html = `
	<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
		<h2 style="font-size: 18px; margin-bottom: 8px;">Sculpt</h2>
		<p style="color:#444;">${greeting}</p>
		<p style="font-size: 15px; line-height: 1.5;">${data.content}</p>
		<p style="margin: 24px 0;">
			<a href="${link}" style="background:#4783E8; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none; font-size:14px;">Open in Sculpt</a>
		</p>
		<p style="color:#888; font-size:12px;">You're receiving this because you were offline when this happened on Sculpt.</p>
	</div>`
	const text = `${greeting}\n\n${data.content}\n\nOpen in Sculpt: ${link}`

	await sendEmail({
		to: data.to,
		subject: "New activity on Sculpt",
		html,
		text,
	})
}
