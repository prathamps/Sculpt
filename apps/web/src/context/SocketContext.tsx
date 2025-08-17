"use client"

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useRef,
	ReactNode,
	useMemo,
} from "react"
import { io, Socket } from "socket.io-client"
import { useAuth } from "./AuthContext"

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface SocketContextType {
	socket: Socket | null
	isConnected: boolean
	joinImageVersion: (imageVersionId: string) => void
	leaveImageVersion: (imageVersionId: string) => void
}

const SocketContext = createContext<SocketContextType>({
	socket: null,
	isConnected: false,
	joinImageVersion: () => {},
	leaveImageVersion: () => {},
})

export const useSocket = () => {
	return useContext(SocketContext)
}

interface SocketProviderProps {
	children: ReactNode
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
	const { user, isAuthenticated } = useAuth()
	const socketRef = useRef<Socket | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const currentImageVersionRef = useRef<string | null>(null)

	// Create socket connection when user is authenticated
	useEffect(() => {
		let socketInstance: Socket | null = null

		if (isAuthenticated && user && !socketRef.current) {
			console.log("Creating new socket connection...")

			// Create socket instance
			socketInstance = io(SOCKET_URL, {
				withCredentials: true,
				reconnectionAttempts: 10,
				reconnectionDelay: 1000,
				timeout: 20000,
				autoConnect: true,
				transports: ["websocket"],
			})

			// Set up event handlers
			socketInstance.on("connect", () => {
				console.log("Socket connected:", socketInstance?.id)
				setIsConnected(true)

				// Join user-specific room
				socketInstance?.emit("join", user.id)
				console.log(`Joined user room: ${user.id}`)

				// Fetch projects and join project-specific rooms
				if (socketInstance) {
					fetchProjectsAndJoinRooms(socketInstance)
				}
			})

			socketInstance.on("disconnect", (reason: string) => {
				console.log("Socket disconnected:", reason)
				setIsConnected(false)
				// Do NOT set socketRef.current to null here
			})

			socketInstance.on("connect_error", (error: Error) => {
				console.error("Socket connection error:", error.message)
				setIsConnected(false)
			})

			// Store socket in ref
			socketRef.current = socketInstance
		}

		// Cleanup on unmount or when auth state changes
		return () => {
			if (socketRef.current) {
				console.log("Cleaning up socket connection")
				socketRef.current.disconnect()
				socketRef.current = null
				currentImageVersionRef.current = null
			}
		}
	}, [isAuthenticated, user])

	// Fetch projects and join their rooms
	const fetchProjectsAndJoinRooms = async (socketInstance: Socket) => {
		try {
			const response = await fetch(`${API_URL}/api/projects`, {
				credentials: "include",
			})
			if (response.ok) {
				const projects = await response.json()
				if (projects && projects.length > 0) {
					projects.forEach((project: { id: string }) => {
						socketInstance.emit("joinProject", project.id)
						console.log(`Requested to join project room: ${project.id}`)
					})
				} else {
					console.log(
						"No projects to join - user is not a member of any projects"
					)
				}
			}
		} catch (error) {
			console.error("Failed to fetch projects to join rooms:", error)
		}
	}

	// Function to join an image version room
	const joinImageVersion = (imageVersionId: string) => {
		if (!socketRef.current || !isConnected || !imageVersionId) return

		// Only join if we're not already in this room
		if (currentImageVersionRef.current !== imageVersionId) {
			// Leave previous room if any
			if (currentImageVersionRef.current) {
				console.log(
					`Leaving previous image version room: ${currentImageVersionRef.current}`
				)
				socketRef.current.emit(
					"leaveImageVersion",
					currentImageVersionRef.current
				)
			}

			// Join new room
			console.log(`Joining image version room: ${imageVersionId}`)
			socketRef.current.emit("joinImageVersion", imageVersionId)
			currentImageVersionRef.current = imageVersionId
		}
	}

	// Function to leave an image version room
	const leaveImageVersion = (imageVersionId: string) => {
		if (!socketRef.current || !isConnected) return

		if (currentImageVersionRef.current === imageVersionId) {
			console.log(`Leaving image version room: ${imageVersionId}`)
			socketRef.current.emit("leaveImageVersion", imageVersionId)
			currentImageVersionRef.current = null
		}
	}

	// Create stable context value with useMemo
	const contextValue = useMemo(
		() => ({
			socket: socketRef.current,
			isConnected,
			joinImageVersion,
			leaveImageVersion,
		}),
		[isConnected, joinImageVersion, leaveImageVersion]
	)

	return (
		<SocketContext.Provider value={contextValue}>
			{children}
		</SocketContext.Provider>
	)
}
