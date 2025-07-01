export interface User {
	id: string
	name: string | null
	email: string
}

export interface ProjectMember {
	user: User
	role: "OWNER" | "MEMBER"
}

export interface ImageVersion {
	id: string
	url: string
	versionName: string
	versionNumber: number
	imageId: string
	createdAt: string
	updatedAt: string
}

export interface Image {
	id: string
	name: string
	projectId: string
	createdAt: string
	updatedAt: string
	versions: ImageVersion[]
	latestVersion?: ImageVersion // For simplified view
	size?: number // Optional as it might not be available in all contexts
}

export interface Comment {
	id: string
	content: string
	imageVersionId: string
	userId: string
	user: User
	parentId?: string
	replies?: Comment[]
	resolved: boolean
	createdAt: string
	updatedAt: string
}

export interface Project {
	id: string
	name: string
	images: Image[]
	members: ProjectMember[]
	createdAt: string
}
