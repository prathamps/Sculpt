import { toast } from "sonner"

// Error type enums for login and signup scenarios
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

// Interface for toast message configuration
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

// Error message mappings for login scenarios
const LOGIN_ERROR_MESSAGES: Record<LoginErrorType, ToastMessage> = {
	invalid_credentials: {
		title: "Invalid email or password",
		description: "Please check your credentials and try again",
		duration: undefined, // Persistent until dismissed
	},
	network_error: {
		title: "Connection error. Please try again",
		description: "Check your internet connection and retry",
		duration: undefined,
	},
	server_error: {
		title: "Server error. Please try again later",
		description: "Our servers are experiencing issues",
		duration: undefined,
	},
	rate_limited: {
		title: "Too many attempts. Please wait before trying again",
		description: "Please wait a few minutes before attempting to log in again",
		duration: undefined,
	},
	unknown: {
		title: "Login failed",
		description: "An unexpected error occurred. Please try again",
		duration: undefined,
	},
}

// Error message mappings for signup scenarios
const SIGNUP_ERROR_MESSAGES: Record<SignupErrorType, ToastMessage> = {
	email_exists: {
		title: "An account with this email already exists",
		description: "Try logging in instead or use a different email address",
		duration: undefined,
	},
	weak_password: {
		title: "Password does not meet requirements",
		description:
			"Password must be at least 8 characters with mixed case, numbers, and symbols",
		duration: undefined,
	},
	validation_error: {
		title: "Please check your information",
		description: "Some fields contain invalid information",
		duration: undefined,
	},
	network_error: {
		title: "Connection error. Please try again",
		description: "Check your internet connection and retry",
		duration: undefined,
	},
	server_error: {
		title: "Server error. Please try again later",
		description: "Our servers are experiencing issues",
		duration: undefined,
	},
	unknown: {
		title: "Registration failed",
		description: "An unexpected error occurred. Please try again",
		duration: undefined,
	},
}

// Authentication Toast Service
export const authToasts = {
	/**
	 * Show success message for successful login
	 */
	showLoginSuccess(): void {
		toast.success("Welcome back!", {
			description: "You're now logged in and ready to go",
			duration: 3000,
		})
	},

	/**
	 * Show error message for failed login attempts
	 * @param errorType - The type of login error that occurred
	 */
	showLoginError(errorType: LoginErrorType): void {
		const message = LOGIN_ERROR_MESSAGES[errorType]
		toast.error(message.title, {
			description: message.description,
			duration: message.duration,
		})
	},

	/**
	 * Show success message for successful signup
	 */
	showSignupSuccess(): void {
		toast.success("Account created successfully!", {
			description: "You can now log in with your new account to get started",
			duration: 4000,
		})
	},

	/**
	 * Show error message for failed signup attempts
	 * @param errorType - The type of signup error that occurred
	 */
	showSignupError(errorType: SignupErrorType): void {
		const message = SIGNUP_ERROR_MESSAGES[errorType]
		toast.error(message.title, {
			description: message.description,
			duration: message.duration,
		})
	},
}

// Interface for API error responses
interface ApiErrorResponse {
	message?: string
	code?: string
	[key: string]: unknown
}

// Utility functions to determine error types from API responses
export const errorUtils = {
	/**
	 * Determine login error type from HTTP status code and response
	 * @param status - HTTP status code
	 * @param response - API response object (optional)
	 * @returns LoginErrorType
	 */
	getLoginErrorType(
		status: number,
		response?: ApiErrorResponse
	): LoginErrorType {
		switch (status) {
			case 401:
				return "invalid_credentials"
			case 429:
				return "rate_limited"
			case 500:
			case 502:
			case 503:
				return "server_error"
			case 0: // Network error (no response)
				return "network_error"
			default:
				return "unknown"
		}
	},

	/**
	 * Determine signup error type from HTTP status code and response
	 * @param status - HTTP status code
	 * @param response - API response object (optional)
	 * @returns SignupErrorType
	 */
	getSignupErrorType(
		status: number,
		_response?: ApiErrorResponse
	): SignupErrorType {
		switch (status) {
			case 409:
				return "email_exists"
			case 400:
				// Check if it's a password validation error
				if (_response?.message?.toLowerCase().includes("password")) {
					return "weak_password"
				}
				return "validation_error"
			case 500:
			case 502:
			case 503:
				return "server_error"
			case 0: // Network error (no response)
				return "network_error"
			default:
				return "unknown"
		}
	},

	/**
	 * Check if an error is a network error
	 * @param error - Error object or fetch error
	 * @returns boolean
	 */
	isNetworkError(error: Error | TypeError | unknown): boolean {
		return (
			error instanceof TypeError ||
			(error as Error)?.message?.includes("fetch") ||
			(error as Error)?.message?.includes("network") ||
			(error as Error)?.name === "NetworkError"
		)
	},
}

// Export types for use in other files
export type { ToastMessage, ApiErrorResponse }
