"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { MemberList } from "@/components/MemberList"
import { InviteMemberForm } from "@/components/InviteMemberForm"
import { ShareLinksSection } from "@/components/ShareLinksSection"
import { useAuth } from "@/context/AuthContext"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Project } from "@/types"

interface MembersModalProps {
	isOpen: boolean
	onClose: () => void
	project: Project | null
	onMembersChanged: () => void
}

export function MembersModal({
	isOpen,
	onClose,
	project,
	onMembersChanged,
}: MembersModalProps) {
	const { user: currentUser } = useAuth()
	const router = useRouter()
	const [isLeaving, setIsLeaving] = useState(false)
	const [isConfirmingLeave, setIsConfirmingLeave] = useState(false)

	if (!project || !currentUser) return null

	const amIOwner = project.members.some(
		(member) => member.user.id === currentUser.id && member.role === "OWNER"
	)
	const ownerCount = project.members.filter((member) => member.role === "OWNER").length
	const isMember = project.members.some((member) => member.user.id === currentUser.id)
	const canLeaveProject = isMember && (!amIOwner || ownerCount > 1)

	const leaveProject = async () => {
		setIsLeaving(true)
		try {
			await api.post(`/api/projects/${project.id}/members/leave`)
			toast.success(`You left "${project.name}".`)
			onClose()
			router.push("/dashboard")
		} catch (error) {
			toast.error(describeError(error, "Could not leave this project."))
		} finally {
			setIsLeaving(false)
			setIsConfirmingLeave(false)
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle className="text-xl font-semibold">Manage Members</DialogTitle>
					<DialogDescription>
						Manage members and create sharing links for &quot;{project.name}&quot;
					</DialogDescription>
				</DialogHeader>

				<MemberList
					projectId={project.id}
					members={project.members}
					canManage={amIOwner}
					onMembersChanged={onMembersChanged}
				/>

				{amIOwner && isOpen && (
					<>
						<InviteMemberForm projectId={project.id} onInvited={onMembersChanged} />
						<Separator className="my-1" />
						<ShareLinksSection projectId={project.id} />
					</>
				)}

				<DialogFooter className="sm:justify-between">
					{canLeaveProject ? (
						<Button
							onClick={() => setIsConfirmingLeave(true)}
							variant="ghost"
							size="sm"
							className="gap-1.5 text-destructive hover:text-destructive"
						>
							<LogOut className="h-3.5 w-3.5" aria-hidden="true" />
							Leave project
						</Button>
					) : (
						<span />
					)}
					<Button onClick={onClose} variant="secondary" size="sm">
						Close
					</Button>
				</DialogFooter>
			</DialogContent>

			<ConfirmationModal
				isOpen={isConfirmingLeave}
				onClose={() => setIsConfirmingLeave(false)}
				onConfirm={leaveProject}
				title={`Leave "${project.name}"?`}
				description="You will lose access to its files and comments. An owner has to invite you back."
				confirmText="Leave project"
				isConfirming={isLeaving}
			/>
		</Dialog>
	)
}
