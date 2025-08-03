"use client"

import { useState, useEffect } from "react"
import { Table } from "@/components/ui/table"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronDown, MoreHorizontal } from "lucide-react"

interface User {
	id: string
	email: string
	name: string | null
	role: "USER" | "ADMIN"
	createdAt: string
	subscription?: {
		plan: "FREE" | "PRO"
		status: string
	} | null
}

export function AdminUserManagement() {
	const [users, setUsers] = useState<User[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const fetchUsers = async () => {
			try {
				const res = await fetch("http://localhost:3001/api/admin/users", {
					credentials: "include",
				})

				if (!res.ok) {
					throw new Error("Failed to fetch users")
				}

				const data = await res.json()
				setUsers(data)
			} catch (err) {
				setError("Error loading users")
				console.error(err)
			} finally {
				setLoading(false)
			}
		}

		fetchUsers()
	}, [])

	const handleRoleChange = async (
		userId: string,
		newRole: "USER" | "ADMIN"
	) => {
		try {
			const res = await fetch(
				`http://localhost:3001/api/admin/users/${userId}/role`,
				{
					method: "PATCH",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ role: newRole }),
				}
			)

			if (!res.ok) {
				throw new Error("Failed to update user role")
			}

			const updatedUser = await res.json()

			setUsers(
				users.map((user) =>
					user.id === userId ? { ...user, role: updatedUser.role } : user
				)
			)
		} catch (err) {
			console.error("Error updating user role:", err)
			alert("Failed to update user role")
		}
	}

	if (loading) {
		return <div className="p-6">Loading users...</div>
	}

	if (error) {
		return <div className="p-6 text-red-500">{error}</div>
	}

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold mb-6">User Management</h1>

			<div className="border rounded-md">
				<Table>
					<thead className="bg-muted/50">
						<tr>
							<th className="py-3 px-4 text-left font-medium">Name</th>
							<th className="py-3 px-4 text-left font-medium">Email</th>
							<th className="py-3 px-4 text-left font-medium">Role</th>
							<th className="py-3 px-4 text-left font-medium">Plan</th>
							<th className="py-3 px-4 text-left font-medium">Joined</th>
							<th className="py-3 px-4 text-left font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user.id} className="border-t hover:bg-muted/50">
								<td className="py-3 px-4">{user.name || "No name"}</td>
								<td className="py-3 px-4">{user.email}</td>
								<td className="py-3 px-4">
									<span
										className={`inline-block px-2 py-1 rounded-full text-xs ${
											user.role === "ADMIN"
												? "bg-purple-100 text-purple-800"
												: "bg-blue-100 text-blue-800"
										}`}
									>
										{user.role}
									</span>
								</td>
								<td className="py-3 px-4">
									<span
										className={`inline-block px-2 py-1 rounded-full text-xs ${
											user.subscription?.plan === "PRO"
												? "bg-green-100 text-green-800"
												: "bg-gray-100 text-gray-800"
										}`}
									>
										{user.subscription?.plan || "FREE"}
									</span>
								</td>
								<td className="py-3 px-4">
									{new Date(user.createdAt).toLocaleDateString()}
								</td>
								<td className="py-3 px-4">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon">
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() =>
													handleRoleChange(
														user.id,
														user.role === "ADMIN" ? "USER" : "ADMIN"
													)
												}
											>
												{user.role === "ADMIN"
													? "Demote to User"
													: "Promote to Admin"}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		</div>
	)
}
