"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ShieldAlert } from "lucide-react"

export default function AdminLoginPage() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false)
	const router = useRouter()

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault()
		setError("")
		setLoading(true)

		try {
			const response = await fetch("http://localhost:3001/api/admin/login", {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email, password }),
			})

			if (response.ok) {
				router.push("/admin")
			} else {
				const data = await response.json()
				setError(data.message || "Invalid admin credentials")
			}
		} catch (err) {
			setError("Failed to connect to the server")
			console.error(err)
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-muted/50">
			<div className="w-full max-w-md space-y-8 rounded-lg border bg-background p-8 shadow-lg">
				<div className="flex flex-col items-center space-y-2 text-center">
					<div className="flex items-center space-x-2">
						<Image src="/logo.png" alt="Sculpt Logo" width={40} height={40} />
						<ShieldAlert className="h-8 w-8 text-primary" />
					</div>
					<h1 className="text-2xl font-bold">Admin Login</h1>
					<p className="text-sm text-muted-foreground">
						Enter your administrator credentials to access the admin portal
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-destructive/10 p-4 text-center text-sm font-medium text-destructive">
						{error}
					</div>
				)}

				<form onSubmit={handleLogin} className="space-y-6">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="admin@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
					</div>

					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Authenticating..." : "Login to Admin Portal"}
					</Button>
				</form>
			</div>
		</div>
	)
}
