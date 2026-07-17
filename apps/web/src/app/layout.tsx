import "@/app/globals.css"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/context/AuthContext"
import { AdminAuthProvider } from "@/context/AdminAuthContext"
import { SocketProvider } from "@/context/SocketContext"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
	title: "Sculpt - Visual Collaboration Platform",
	description:
		"A powerful real-time image collaboration platform that streamlines the process of giving and receiving visual feedback.",
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html className="dark" lang="en" suppressHydrationWarning>
			<body className={inter.className}>
				<AuthProvider>
					<AdminAuthProvider>
						<SocketProvider>
							{children}
							<Toaster
								position="bottom-right"
								theme="dark"
								richColors
								closeButton={false}
								duration={4000}
								visibleToasts={5}
								expand={false}
								toastOptions={{
									style: {
										background: "hsl(var(--background))",
										border: "1px solid hsl(var(--border))",
										color: "hsl(var(--foreground))",
									},
								}}
							/>
						</SocketProvider>
					</AdminAuthProvider>
				</AuthProvider>
			</body>
		</html>
	)
}
