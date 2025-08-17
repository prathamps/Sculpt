"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts"

interface DashboardStats {
	totalUsers: number
	totalProjects: number
	totalImages: number
	totalComments: number
	usersByDay: Array<{
		date: string
		count: number
	}>
	projectsByDay: Array<{
		date: string
		count: number
	}>
}

export function AdminDashboard() {
	const [stats, setStats] = useState<DashboardStats | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	useEffect(() => {
		const fetchStats = async () => {
			try {
				const res = await fetch(`${URI}/api/admin/stats`, {
					credentials: "include",
				})

				if (!res.ok) {
					throw new Error("Failed to fetch stats")
				}

				const data = await res.json()
				setStats(data)
			} catch (err) {
				setError("Error loading dashboard stats")
				console.error(err)
			} finally {
				setLoading(false)
			}
		}

		fetchStats()
	}, [])

	if (loading) {
		return <div className="p-6">Loading statistics...</div>
	}

	if (error) {
		return <div className="p-6 text-red-500">{error}</div>
	}

	if (!stats) {
		return <div className="p-6">No data available</div>
	}

	// Format data for charts
	const userChartData = stats.usersByDay.map((day) => ({
		date: new Date(day.date).toLocaleDateString(),
		users: day.count,
	}))

	const projectChartData = stats.projectsByDay.map((day) => ({
		date: new Date(day.date).toLocaleDateString(),
		projects: day.count,
	}))

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<Card className="p-6">
					<h3 className="text-lg font-medium text-muted-foreground mb-2">
						Users
					</h3>
					<p className="text-3xl font-bold">{stats.totalUsers}</p>
				</Card>

				<Card className="p-6">
					<h3 className="text-lg font-medium text-muted-foreground mb-2">
						Projects
					</h3>
					<p className="text-3xl font-bold">{stats.totalProjects}</p>
				</Card>

				<Card className="p-6">
					<h3 className="text-lg font-medium text-muted-foreground mb-2">
						Images
					</h3>
					<p className="text-3xl font-bold">{stats.totalImages}</p>
				</Card>

				<Card className="p-6">
					<h3 className="text-lg font-medium text-muted-foreground mb-2">
						Comments
					</h3>
					<p className="text-3xl font-bold">{stats.totalComments}</p>
				</Card>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
				<Card className="p-6">
					<h3 className="text-lg font-medium mb-4">User Registrations</h3>
					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart
								data={userChartData}
								margin={{
									top: 5,
									right: 30,
									left: 20,
									bottom: 5,
								}}
							>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="date" />
								<YAxis />
								<Tooltip />
								<Legend />
								<Line
									type="monotone"
									dataKey="users"
									name="New Users"
									stroke="#8884d8"
									activeDot={{ r: 8 }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</Card>

				<Card className="p-6">
					<h3 className="text-lg font-medium mb-4">Project Creation</h3>
					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart
								data={projectChartData}
								margin={{
									top: 5,
									right: 30,
									left: 20,
									bottom: 5,
								}}
							>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="date" />
								<YAxis />
								<Tooltip />
								<Legend />
								<Line
									type="monotone"
									dataKey="projects"
									name="New Projects"
									stroke="#82ca9d"
									activeDot={{ r: 8 }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</Card>
			</div>
		</div>
	)
}
