export interface User {
	id: string
	name: string | null
	email: string
}

export interface ProjectMember {
	user: User
	role: "OWNER" | "MEMBER"
}

export interface Image {
	id: string
	url: string
	name: string
}

export interface Project {
	id: string
	name: string
	images: Image[]
	members: ProjectMember[]
	createdAt: string
}
