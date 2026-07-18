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

const themeScript = `
try {
	var t = localStorage.getItem('theme');
	if (t === 'light') document.documentElement.classList.remove('dark');
	else document.documentElement.classList.add('dark');
} catch (e) {
	document.documentElement.classList.add('dark');
}
`

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className={inter.className}>
				<AuthProvider>
					<AdminAuthProvider>
						<SocketProvider>
							{children}
							<Toaster
								position="bottom-right"
								theme="system"
								richColors
								closeButton={false}
								duration={4000}
								visibleToasts={5}
								expand={false}
							/>
						</SocketProvider>
					</AdminAuthProvider>
				</AuthProvider>
			</body>
		</html>
	)
}
