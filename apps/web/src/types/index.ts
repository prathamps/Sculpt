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
	dimmed?: boolean
	t?: number // timestamp (seconds) for video annotations
	tEnd?: number // range end (seconds) for video annotations
	page?: number // 1-based page for PDF annotations
}

export type MediaType = "IMAGE" | "VIDEO" | "PDF" | "MODEL"

export type Vec3 = [number, number, number]

// A comment's pin on a 3D model, in normalized model space (the viewer
// centers the model at the origin and scales it to a fixed size on load).
export interface ModelAnchor {
	position: Vec3
	normal?: Vec3
	camera?: {
		position: Vec3
		target: Vec3
	}
}

export interface ImageVersion {
	id: string
	url: string
	versionName: string
	versionNumber: number
	imageId: string
	mediaType?: MediaType
	duration?: number | null
	thumbnailUrl?: string | null
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
	timestampEnd?: number | null // range end; null/absent = instant comment
	page?: number | null // 1-based PDF page this comment is anchored to
	modelAnchor?: ModelAnchor | null // 3D pin for MODEL versions
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
