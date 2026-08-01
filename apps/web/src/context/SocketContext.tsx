"use client"

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	useRef,
	ReactNode,
	useMemo,
} from "react"
import { io, Socket } from "socket.io-client"
import { useAuth } from "./AuthContext"
import { Paginated, api } from "@/lib/api"
import { ignoreFailure } from "@/lib/errors"

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"

interface SocketContextType {
	socket: Socket | null
	isConnected: boolean
	reconnectCount: number
	joinImageVersion: (imageVersionId: string) => void
	leaveImageVersion: (imageVersionId: string) => void
}

const SocketContext = createContext<SocketContextType>({
	socket: null,
	isConnected: false,
	reconnectCount: 0,
	joinImageVersion: () => {},
	leaveImageVersion: () => {},
})

export const useSocket = () => useContext(SocketContext)

interface SocketProviderProps {
	children: ReactNode
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
	const { user, isAuthenticated } = useAuth()
	const userId = user?.id ?? null
	const [socket, setSocket] = useState<Socket | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [reconnectCount, setReconnectCount] = useState(0)
	const joinedVersionRef = useRef<string | null>(null)
	const hasConnectedBeforeRef = useRef(false)

	useEffect(() => {
		if (!isAuthenticated || !userId) return

		const instance = io(SOCKET_URL, {
			withCredentials: true,
			reconnectionAttempts: Infinity,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 10000,
			timeout: 20000,
			transports: ["websocket", "polling"],
		})

		const joinAccessibleProjects = () =>
			api
				.get<Paginated<{ id: string }>>("/api/projects?pageSize=100")
				.then((response) =>
					response.items.forEach((project) =>
						instance.emit("joinProject", project.id)
					)
				)
				.catch(ignoreFailure)

		instance.on("connect", () => {
			setIsConnected(true)

			instance.emit("join")
			void joinAccessibleProjects()

			const rejoinVersionId = joinedVersionRef.current
			if (rejoinVersionId) {
				instance.emit("joinImageVersion", rejoinVersionId)
			}

			if (hasConnectedBeforeRef.current) {
				setReconnectCount((count) => count + 1)
			}
			hasConnectedBeforeRef.current = true
		})

		instance.on("disconnect", () => setIsConnected(false))
		instance.on("connect_error", () => setIsConnected(false))

		setSocket(instance)

		return () => {
			instance.removeAllListeners()
			instance.disconnect()
			setSocket(null)
			setIsConnected(false)
			joinedVersionRef.current = null
			hasConnectedBeforeRef.current = false
		}
	}, [isAuthenticated, userId])

	const joinImageVersion = useCallback(
		(imageVersionId: string) => {
			if (!imageVersionId) return

			const previous = joinedVersionRef.current
			if (previous === imageVersionId) return

			if (previous && socket) socket.emit("leaveImageVersion", previous)

			joinedVersionRef.current = imageVersionId
			if (socket?.connected) socket.emit("joinImageVersion", imageVersionId)
		},
		[socket]
	)

	const leaveImageVersion = useCallback(
		(imageVersionId: string) => {
			if (joinedVersionRef.current !== imageVersionId) return
			joinedVersionRef.current = null
			if (socket?.connected) socket.emit("leaveImageVersion", imageVersionId)
		},
		[socket]
	)

	const contextValue = useMemo(
		() => ({
			socket,
			isConnected,
			reconnectCount,
			joinImageVersion,
			leaveImageVersion,
		}),
		[socket, isConnected, reconnectCount, joinImageVersion, leaveImageVersion]
	)

	return (
		<SocketContext.Provider value={contextValue}>
			{children}
		</SocketContext.Provider>
	)
}
