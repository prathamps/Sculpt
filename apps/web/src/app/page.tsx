"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"

const Header = () => {
	const [menuOpen, setMenuOpen] = useState(false)

	return (
		<header className="flex justify-between items-center p-5 bg-[#1e1e1e]">
			<div className="flex items-center space-x-2">
				<Image src="/logo.png" alt="Sculpt Logo" width={25} height={25} />
				<span className="text-2xl font-bold">Sculpt</span>
			</div>
			<nav>
				<button
					className="md:hidden text-2xl"
					onClick={() => setMenuOpen(!menuOpen)}
					aria-label="Toggle navigation menu"
				>
					☰
				</button>
				<ul
					className={`absolute md:relative top-16 left-0 md:top-auto md:left-auto w-full md:w-auto bg-[#1e1e1e] md:bg-transparent flex-col md:flex-row md:flex items-center space-y-4 md:space-y-0 md:space-x-4 p-5 md:p-0 ${
						menuOpen ? "flex" : "hidden"
					}`}
				>
					<li>
						<Link href="#product" className="hover:text-[#a45945]">
							Product
						</Link>
					</li>
					<li>
						<Link href="#features" className="hover:text-[#a45945]">
							Key Features
						</Link>
					</li>
					<li>
						<Link href="#resources" className="hover:text-[#a45945]">
							Resources
						</Link>
					</li>
					<li>
						<Link
							href="/login"
							className="px-4 py-2 rounded-md hover:bg-[#a45945]"
						>
							Sign In
						</Link>
					</li>
					<li>
						<Link
							href="/register"
							className="px-4 py-2 rounded-md hover:bg-[#a45945]"
						>
							Sign Up
						</Link>
					</li>
				</ul>
			</nav>
		</header>
	)
}

const Hero = () => (
	<section
		id="product"
		className="flex flex-col items-center text-center py-32 px-5"
	>
		<h1 className="text-5xl font-bold mb-5 bg-gradient-to-r from-[#a45945] to-[#ff9a76] text-transparent bg-clip-text">
			Collaborate Like Never Before
		</h1>
		<p className="text-lg text-gray-400 mb-5">
			Your go-to platform for seamless media collaboration and real-time
			feedback.
		</p>
		<div className="flex gap-4">
			<Link
				href="/register"
				className="bg-[#a45945] text-white px-6 py-3 rounded-md font-bold hover:bg-[#871f1f] transition-colors"
			>
				Start Free Trial
			</Link>
		</div>
		<div className="mt-10">
			<Image
				src="/herobanner.jpg"
				alt="Hero Image"
				width={800}
				height={400}
				className="rounded-lg"
			/>
		</div>
	</section>
)

const FeatureCard = ({
	imgSrc,
	title,
	description,
}: {
	imgSrc: string
	title: string
	description: string
}) => (
	<div className="bg-[#1e1e1e] rounded-lg p-5 flex items-center gap-5 w-full max-w-3xl transform hover:scale-105 transition-transform">
		<Image
			src={imgSrc}
			alt={title}
			width={80}
			height={80}
			className="rounded-lg"
		/>
		<div>
			<h3 className="text-xl font-bold mb-1">{title}</h3>
			<p className="text-gray-400">{description}</p>
		</div>
	</div>
)

const Features = () => (
	<section id="features" className="flex flex-col items-center py-20 px-5">
		<h2 className="text-4xl font-bold mb-10 bg-gradient-to-r from-[#a45945] to-[#ff9a76] text-transparent bg-clip-text">
			Our Key Features
		</h2>
		<div className="flex flex-col gap-8">
			<FeatureCard
				imgSrc="/remote.jpg"
				title="Real-time Feedback"
				description="Receive instant comments and notes to enhance your projects efficiently."
			/>
			<FeatureCard
				imgSrc="/collaboration.jpg"
				title="Enhanced Collaboration"
				description="Work with your team from anywhere, sharing files and tracking changes seamlessly."
			/>
			<FeatureCard
				imgSrc="/analytics.jpg"
				title="Streamlined Workflow"
				description="Automate repetitive tasks and streamline your team's workflow for maximum productivity."
			/>
		</div>
	</section>
)

const Footer = () => (
	<footer id="resources" className="bg-[#111] text-gray-400 py-10">
		<div className="max-w-6xl mx-auto px-5">
			<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
				<div className="flex items-center">
					<Image src="/logo.png" alt="Sculpt Logo" width={35} height={35} />
					<span className="text-xl font-bold ml-2 text-[#a45945]">Sculpt</span>
				</div>
				<div className="grid grid-cols-2 gap-8">
					<div>
						<h4 className="font-bold text-[#a45945] mb-4">Features</h4>
						<ul>
							<li>
								<Link href="#product" className="hover:text-[#a45945]">
									Product
								</Link>
							</li>
							<li>
								<Link href="#features" className="hover:text-[#a45945]">
									Key Features
								</Link>
							</li>
							<li>
								<Link href="#resources" className="hover:text-[#a45945]">
									Resources
								</Link>
							</li>
						</ul>
					</div>
					<div>
						<h4 className="font-bold text-[#a45945] mb-4">Company</h4>
						<ul>
							<li>
								<Link href="/login" className="hover:text-[#a45945]">
									Start Working
								</Link>
							</li>
							<li>
								<Link href="/register" className="hover:text-[#a45945]">
									Join Us
								</Link>
							</li>
							<li>
								<Link href="#" className="hover:text-[#a45945]">
									Contact Us
								</Link>
							</li>
						</ul>
					</div>
				</div>
			</div>
			<div className="flex justify-between items-center mt-10 border-t border-gray-800 pt-5 text-sm">
				<p>&copy; 2024 Sculpt. All rights reserved.</p>
				<div className="flex space-x-4">
					<Link href="#" className="hover:text-[#a45945]">
						Terms
					</Link>
					<Link href="#" className="hover:text-[#a45945]">
						Privacy
					</Link>
				</div>
			</div>
		</div>
	</footer>
)

export default function Home() {
	return (
		<main className="bg-[#121212] text-white">
			<Header />
			<Hero />
			<Features />
			<Footer />
		</main>
	)
}
