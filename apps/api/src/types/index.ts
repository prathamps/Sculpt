export interface User {
	id: string
	email: string
	name?: string
	role: "USER" | "ADMIN"
	createdAt: Date
	updatedAt: Date
}

export interface Project {
	id: string
	name: string
	createdAt: Date
	updatedAt: Date
}

export interface Comment {
	id: string
	content: string
	userId: string
	imageVersionId: string
	createdAt: Date
	updatedAt: Date
}
