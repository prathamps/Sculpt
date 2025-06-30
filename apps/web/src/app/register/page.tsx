"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export default function RegisterPage() {
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const router = useRouter()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)

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
			setError(errorData.message || "Registration failed")
			toast.error(errorData.message || "Registration failed")
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
					<h2 className="text-3xl font-bold">Sign Up to Get Started</h2>
				</div>
				<form onSubmit={handleSubmit} className="space-y-6">
					<Input
						id="name"
						placeholder="Full Name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full px-4 py-3 bg-[#333] border-none rounded-md text-white focus:bg-[#444] focus:outline-none focus:ring-2 focus:ring-[#a45945] transition-all"
					/>
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
						Sign Up
					</Button>
				</form>
				<p className="text-center text-gray-400">
					Already have an account?{" "}
					<Link
						href="/login"
						className="text-[#a45945] hover:text-white transition-colors"
					>
						Log in here
					</Link>
				</p>
			</div>
		</div>
	)
}
