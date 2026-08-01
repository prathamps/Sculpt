"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { AlertTriangle, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Project } from "@/types"

export default function AcceptInvitationPage() {
	const { token } = useParams<{ token: string }>()
	const router = useRouter()
	const { isAuthenticated, loading } = useAuth()
	const [error, setError] = useState<string | null>(null)
	const [isAccepting, setIsAccepting] = useState(false)

	const accept = useCallback(async () => {
		setIsAccepting(true)
		setError(null)
		try {
			const project = await api.post<Project>(`/api/invitations/${token}/accept`)
			router.replace(`/project/${project.id}`)
		} catch (caught) {
			setError(describeError(caught, "This invitation could not be accepted."))
		} finally {
			setIsAccepting(false)
		}
	}, [token, router])

	useEffect(() => {
		if (loading) return

		if (!isAuthenticated) {
			router.replace(
				`/login?next=${encodeURIComponent(`/invitations/${token}`)}`
			)
			return
		}

		void accept()
	}, [loading, isAuthenticated, router, token, accept])

	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Project invitation</CardTitle>
					<CardDescription>
						We&apos;re adding you to the project you were invited to.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{error ? (
						<div className="flex flex-col items-center gap-3 py-2 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
								<AlertTriangle className="h-6 w-6" aria-hidden="true" />
							</div>
							<p className="text-sm text-muted-foreground">{error}</p>
							<div className="mt-2 flex gap-2">
								<Button
									variant="outline"
									onClick={accept}
									disabled={isAccepting}
								>
									Try again
								</Button>
								<Button asChild>
									<Link href="/dashboard">Go to dashboard</Link>
								</Button>
							</div>
						</div>
					) : (
						<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
							Accepting your invitation…
						</div>
					)}
				</CardContent>
			</Card>
		</main>
	)
}
