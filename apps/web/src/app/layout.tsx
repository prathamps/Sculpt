import type { Metadata } from "next"
import { Inter, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/context/AuthContext"
import { SocketProvider } from "@/context/SocketContext"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-jakarta",
})

export const metadata: Metadata = {
	title: "Sculpt - Collaborative Image Annotation",
	description: "Streamlined image annotation and collaboration platform",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en" className="dark">
			<body className={`${inter.variable} ${jakarta.variable} font-jakarta`}>
				<AuthProvider>
					<SocketProvider>{children}</SocketProvider>
				</AuthProvider>
				<Toaster position="top-right" closeButton richColors />
			</body>
		</html>
	)
}
