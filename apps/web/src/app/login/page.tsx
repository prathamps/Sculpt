"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const router = useRouter()
	const { login } = useAuth()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsLoading(true)

		try {
			const res = await fetch("http://localhost:3001/api/auth/login", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			})

			if (res.ok) {
				login()
				toast.success("Login successful!")
				router.push("/dashboard")
			} else {
				toast.error("Login failed. Please check your credentials.")
				console.error("Login failed")
			}
		} catch (error) {
			toast.error("An error occurred during login.")
			console.error(error)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex items-center gap-6 border-b border-border/40 px-6 py-4">
				<Link
					href="/"
					className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-4 w-4" />
					<span className="text-sm">Back to home</span>
				</Link>
			</div>
			<div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
				<div className="mx-auto w-full max-w-md">
					<div className="mb-8 flex flex-col items-center">
						<Image
							src="/logo.png"
							alt="Sculpt Logo"
							width={48}
							height={48}
							className="mb-2"
						/>
						<h1 className="text-center text-2xl font-semibold tracking-tight">
							Welcome back
						</h1>
						<p className="mt-2 text-center text-sm text-muted-foreground">
							Enter your credentials to access your account
						</p>
					</div>
					<div className="rounded-lg border border-border/50 bg-card p-6 shadow-sm">
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									type="email"
									id="email"
									placeholder="name@example.com"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="bg-background/50"
									autoComplete="email"
									autoFocus
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="password">Password</Label>
									<Link
										href="#"
										className="text-xs text-primary hover:underline"
									>
										Forgot password?
									</Link>
								</div>
								<Input
									type="password"
									id="password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									className="bg-background/50"
									autoComplete="current-password"
								/>
							</div>
							<Button type="submit" className="w-full" disabled={isLoading}>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Signing in...
									</>
								) : (
									"Sign In"
								)}
							</Button>
						</form>
					</div>
					<div className="mt-6 text-center text-sm">
						Don't have an account?{" "}
						<Link href="/register" className="text-primary hover:underline">
							Sign up
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}
