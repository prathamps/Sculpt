export interface User {
	id: string
	name: string | null
	email: string
}

export type ProjectRole = "OWNER" | "EDITOR" | "MEMBER" | "VIEWER"

export interface ProjectMember {
	user: User
	role: ProjectRole
}

export interface Point {
	x: number
	y: number
}

export interface Annotation {
	id: number
	type: "pencil" | "rect" | "line"
	color: string
	points: Point[]
	isHighlighted?: boolean
	t?: number // timestamp (seconds) for video annotations
}

export type MediaType = "IMAGE" | "VIDEO"

export interface ImageVersion {
	id: string
	url: string
	versionName: string
	versionNumber: number
	imageId: string
	mediaType?: MediaType
	duration?: number | null
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

export interface CommentLike {
	id: string
	userId: string
	user: User
	commentId: string
	createdAt: string
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
	likes?: CommentLike[]
	likeCount?: number
	isLikedByCurrentUser?: boolean
	annotation?: Annotation | Annotation[] // Can be a single annotation or an array of annotations
	timestamp?: number | null // seconds into a video this comment is anchored to
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
