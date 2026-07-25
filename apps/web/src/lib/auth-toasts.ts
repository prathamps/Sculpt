import { toast } from "sonner"

export type LoginErrorType =
	| "invalid_credentials"
	| "network_error"
	| "server_error"
	| "rate_limited"
	| "unknown"

export type SignupErrorType =
	| "email_exists"
	| "weak_password"
	| "validation_error"
	| "network_error"
	| "server_error"
	| "unknown"

interface ToastMessage {
	title: string
	description?: string
	duration?: number
	ariaProps?: {
		role?: string
		"aria-live"?: "polite" | "assertive"
		"aria-atomic"?: boolean
		"aria-describedby"?: string
	}
}

const PERSIST_UNTIL_DISMISSED: number | undefined = undefined

const LOGIN_ERROR_MESSAGES: Record<LoginErrorType, ToastMessage> = {
	invalid_credentials: {
		title: "Invalid email or password",
		description: "Please check your credentials and try again",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	network_error: {
		title: "Connection error. Please try again",
		description: "Check your internet connection and retry",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	server_error: {
		title: "Server error. Please try again later",
		description: "Our servers are experiencing issues",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	rate_limited: {
		title: "Too many attempts. Please wait before trying again",
		description: "Please wait a few minutes before attempting to log in again",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	unknown: {
		title: "Login failed",
		description: "An unexpected error occurred. Please try again",
		duration: PERSIST_UNTIL_DISMISSED,
	},
}

const SIGNUP_ERROR_MESSAGES: Record<SignupErrorType, ToastMessage> = {
	email_exists: {
		title: "An account with this email already exists",
		description: "Try logging in instead or use a different email address",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	weak_password: {
		title: "Password does not meet requirements",
		description:
			"Password must be at least 8 characters with mixed case, numbers, and symbols",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	validation_error: {
		title: "Please check your information",
		description: "Some fields contain invalid information",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	network_error: {
		title: "Connection error. Please try again",
		description: "Check your internet connection and retry",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	server_error: {
		title: "Server error. Please try again later",
		description: "Our servers are experiencing issues",
		duration: PERSIST_UNTIL_DISMISSED,
	},
	unknown: {
		title: "Registration failed",
		description: "An unexpected error occurred. Please try again",
		duration: PERSIST_UNTIL_DISMISSED,
	},
}

export const authToasts = {
	showLoginSuccess(): void {
		toast.success("Welcome back!", {
			description: "You're now logged in and ready to go",
			duration: 3000,
		})
	},

	showLoginError(errorType: LoginErrorType): void {
		const message = LOGIN_ERROR_MESSAGES[errorType]
		toast.error(message.title, {
			description: message.description,
			duration: message.duration,
		})
	},

	showSignupSuccess(): void {
		toast.success("Account created successfully!", {
			description: "You can now log in with your new account to get started",
			duration: 4000,
		})
	},

	showSignupError(errorType: SignupErrorType): void {
		const message = SIGNUP_ERROR_MESSAGES[errorType]
		toast.error(message.title, {
			description: message.description,
			duration: message.duration,
		})
	},
}

interface ApiErrorResponse {
	message?: string
	code?: string
	[key: string]: unknown
}

const NO_RESPONSE_STATUS = 0

export const errorUtils = {
	getLoginErrorType(status: number): LoginErrorType {
		switch (status) {
			case 401:
				return "invalid_credentials"
			case 429:
				return "rate_limited"
			case 500:
			case 502:
			case 503:
				return "server_error"
			case NO_RESPONSE_STATUS:
				return "network_error"
			default:
				return "unknown"
		}
	},

	getSignupErrorType(
		status: number,
		_response?: ApiErrorResponse
	): SignupErrorType {
		switch (status) {
			case 409:
				return "email_exists"
			case 400:
				if (_response?.message?.toLowerCase().includes("password")) {
					return "weak_password"
				}
				return "validation_error"
			case 500:
			case 502:
			case 503:
				return "server_error"
			case NO_RESPONSE_STATUS:
				return "network_error"
			default:
				return "unknown"
		}
	},

	isNetworkError(error: Error | TypeError | unknown): boolean {
		return (
			error instanceof TypeError ||
			(error as Error)?.message?.includes("fetch") ||
			(error as Error)?.message?.includes("network") ||
			(error as Error)?.name === "NetworkError"
		)
	},
}

export type { ToastMessage, ApiErrorResponse }
