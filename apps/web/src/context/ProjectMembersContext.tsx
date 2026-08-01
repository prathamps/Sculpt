"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { api } from "@/lib/api"

export interface MentionableMember {
	id: string
	userId: string
	role: string
	user: {
		id: string
		name: string | null
		email: string
		avatarUrl: string | null
	}
}

const ProjectMembersContext = createContext<MentionableMember[]>([])

export function ProjectMembersProvider({
	projectId,
	children,
}: {
	projectId: string
	children: React.ReactNode
}) {
	const [members, setMembers] = useState<MentionableMember[]>([])

	useEffect(() => {
		let cancelled = false
		api
			.get<MentionableMember[]>(`/api/projects/${projectId}/members`)
			.then((data) => {
				if (!cancelled) setMembers(data)
			})
			.catch((): void => undefined)
		return (): void => {
			cancelled = true
		}
	}, [projectId])

	return (
		<ProjectMembersContext.Provider value={members}>
			{children}
		</ProjectMembersContext.Provider>
	)
}

export const useProjectMembers = (): MentionableMember[] =>
	useContext(ProjectMembersContext)
