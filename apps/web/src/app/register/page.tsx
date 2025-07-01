"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const router = useRouter()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsLoading(true)

		try {
			const res = await fetch("http://localhost:3001/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, password }),
			})

			if (res.ok) {
				toast.success("Registration successful! Please log in.")
				router.push("/login")
			} else {
				const errorData = await res.json()
				toast.error(errorData.message || "Registration failed")
			}
		} catch (error) {
			toast.error("An error occurred during registration")
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
							Create an account
						</h1>
						<p className="mt-2 text-center text-sm text-muted-foreground">
							Sign up to start collaborating on projects
						</p>
					</div>
					<div className="rounded-lg border border-border/50 bg-card p-6 shadow-sm">
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="name">Full Name</Label>
								<Input
									type="text"
									id="name"
									placeholder="John Doe"
									required
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="bg-background/50"
									autoComplete="name"
									autoFocus
								/>
							</div>
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
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									type="password"
									id="password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									className="bg-background/50"
									autoComplete="new-password"
									placeholder="Create a secure password"
								/>
							</div>
							<Button
								type="submit"
								className="w-full"
								disabled={
									isLoading || !name.trim() || !email.trim() || !password.trim()
								}
							>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating account...
									</>
								) : (
									"Sign Up"
								)}
							</Button>
						</form>
					</div>
					<div className="mt-6 text-center text-sm">
						Already have an account?{" "}
						<Link href="/login" className="text-primary hover:underline">
							Sign in
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}
