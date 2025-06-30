"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

export default function LoginPage() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const router = useRouter()
	const { login } = useAuth()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

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
	}

	return (
		<div className="flex items-center justify-center min-h-screen bg-[#121212] text-white">
			<Link
				href="/"
				className="fixed top-4 left-4 text-2xl font-bold text-[#a45945] hover:text-white transition-colors"
			>
				&lt;
			</Link>
			<div className="w-full max-w-md p-8 space-y-8 bg-[#1e1e1e] rounded-lg shadow-lg">
				<div className="text-center">
					<h2 className="text-3xl font-bold">Login</h2>
				</div>
				<form onSubmit={handleSubmit} className="space-y-6">
					<Input
						type="email"
						id="email"
						placeholder="Email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full px-4 py-3 bg-[#333] border-none rounded-md text-white focus:bg-[#444] focus:outline-none focus:ring-2 focus:ring-[#a45945] transition-all"
					/>
					<Input
						type="password"
						id="password"
						placeholder="Password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full px-4 py-3 bg-[#333] border-none rounded-md text-white focus:bg-[#444] focus:outline-none focus:ring-2 focus:ring-[#a45945] transition-all"
					/>
					<Button
						type="submit"
						className="w-full py-3 font-bold text-white bg-gradient-to-r from-[#a45945] to-[#ff9a76] rounded-md hover:scale-105 transition-transform"
					>
						Login
					</Button>
				</form>
				<p className="text-center text-gray-400">
					Don't have an account?{" "}
					<Link
						href="/register"
						className="text-[#a45945] hover:text-white transition-colors"
					>
						Sign up here
					</Link>
				</p>
			</div>
		</div>
	)
}
