"use client"

import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/UserAvatar"
import { ProjectRoleIcon } from "@/components/ProjectRoleIcon"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { ProjectMember } from "@/types"

interface MemberListProps {
	projectId: string
	members: ProjectMember[]
	canManage: boolean
	onMembersChanged: () => void
}

export function MemberList({
	projectId,
	members,
	canManage,
	onMembersChanged,
}: MemberListProps) {
	const removeMember = async (userId: string) => {
		try {
			await api.delete(`/api/projects/${projectId}/members/${userId}`)
			onMembersChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not remove that member."))
		}
	}

	return (
		<div className="space-y-3 pt-2">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-muted-foreground">
					PROJECT MEMBERS
				</h3>
				<span className="text-xs text-muted-foreground">
					{members.length} members
				</span>
			</div>

			<div className="divide-y divide-border/30 rounded-md border border-border/50 overflow-hidden">
				{members.map((member) => {
					const displayName = member.user.name || "Unnamed user"
					return (
						<div
							key={member.user.id}
							className="flex items-center justify-between px-3 py-2.5 bg-card/50"
						>
							<div className="flex items-center gap-2.5">
								<UserAvatar
									className="h-8 w-8"
									name={member.user.name}
									email={member.user.email}
									avatarUrl={member.user.avatarUrl}
								/>
								<div>
									<p className="text-sm font-medium">{displayName}</p>
									<p className="text-xs text-muted-foreground">
										{member.user.email}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<div className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-xs">
									<ProjectRoleIcon role={member.role} />
									<span>{member.role}</span>
								</div>
								{canManage && member.role !== "OWNER" && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => void removeMember(member.user.id)}
													aria-label={`Remove ${displayName}`}
													className="h-7 w-7 text-muted-foreground hover:text-destructive"
												>
													<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
												</Button>
											</TooltipTrigger>
											<TooltipContent side="left">
												<p className="text-xs">Remove member</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
