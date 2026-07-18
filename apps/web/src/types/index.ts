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
	t?: number
	tEnd?: number
	page?: number
}

export type MediaType = "IMAGE" | "VIDEO" | "PDF" | "MODEL"

export type Vec3 = [number, number, number]

export interface ModelAnchor {
	position: Vec3
	normal?: Vec3
	camera?: {
		position: Vec3
		target: Vec3
	}
}

export type ProxyStatus = "PENDING" | "READY" | "FAILED"

export interface ImageVersion {
	id: string
	url: string
	versionName: string
	versionNumber: number
	imageId: string
	mediaType?: MediaType
	duration?: number | null
	thumbnailUrl?: string | null
	proxyUrl?: string | null
	proxyStatus?: ProxyStatus | null
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
	latestVersion?: ImageVersion
	size?: number
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
	annotation?: Annotation | Annotation[]
	timestamp?: number | null
	timestampEnd?: number | null
	page?: number | null
	modelAnchor?: ModelAnchor | null
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
