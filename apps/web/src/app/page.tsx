"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronRight, Menu, X, Globe, Users, Zap } from "lucide-react"

const Header = () => {
	const [menuOpen, setMenuOpen] = useState(false)

	return (
		<header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border/10 bg-background/80 px-4 backdrop-blur-sm md:px-6">
			<div className="flex items-center gap-2">
				<Image src="/logo.png" alt="Sculpt Logo" width={32} height={32} />
				<span className="text-xl font-semibold">Sculpt</span>
			</div>
			<nav>
				<button
					className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary md:hidden"
					onClick={() => setMenuOpen(!menuOpen)}
					aria-label="Toggle navigation menu"
				>
					{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
				</button>
				<ul
					className={`fixed inset-x-0 top-16 z-50 flex-col border-b border-border/10 bg-background/95 px-4 pb-6 pt-4 backdrop-blur-sm transition-all md:static md:inset-auto md:z-auto md:flex md:flex-row md:items-center md:gap-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none ${
						menuOpen ? "flex" : "hidden"
					}`}
				>
					<li className="py-2 md:py-0">
						<Link
							href="#product"
							className="text-sm text-foreground/80 transition-colors hover:text-primary"
							onClick={() => setMenuOpen(false)}
						>
							Product
						</Link>
					</li>
					<li className="py-2 md:py-0">
						<Link
							href="#features"
							className="text-sm text-foreground/80 transition-colors hover:text-primary"
							onClick={() => setMenuOpen(false)}
						>
							Features
						</Link>
					</li>
					<li className="py-2 md:py-0">
						<Link
							href="#resources"
							className="text-sm text-foreground/80 transition-colors hover:text-primary"
							onClick={() => setMenuOpen(false)}
						>
							Resources
						</Link>
					</li>
					<li className="mt-4 md:mt-0">
						<div className="flex flex-col gap-2 md:flex-row">
							<Button asChild variant="outline" size="sm">
								<Link href="/login">Sign In</Link>
							</Button>
							<Button asChild size="sm">
								<Link href="/register">Sign Up</Link>
							</Button>
						</div>
					</li>
				</ul>
			</nav>
		</header>
	)
}

const Hero = () => (
	<section
		id="product"
		className="relative mx-auto max-w-6xl px-4 py-20 md:py-32"
	>
		<div className="mx-auto max-w-3xl text-center">
			<h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
				Collaborate on images <span className="text-primary">seamlessly</span>
			</h1>
			<p className="mb-8 text-lg text-muted-foreground">
				Your powerful platform for real-time image collaboration and feedback.
				Streamline your workflow with intuitive tools.
			</p>
			<div className="flex flex-col justify-center gap-4 sm:flex-row">
				<Button asChild size="lg">
					<Link href="/register">
						Get Started <ChevronRight className="ml-1 h-4 w-4" />
					</Link>
				</Button>
				<Button asChild variant="outline" size="lg">
					<Link href="#features">Learn More</Link>
				</Button>
			</div>
		</div>
		<div className="relative mx-auto mt-12 max-w-5xl overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-xl">
			<Image
				src="/herobanner.jpg"
				alt="Sculpt Platform Preview"
				width={1200}
				height={600}
				className="w-full"
			/>
			<div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />
		</div>
	</section>
)

const FeatureCard = ({
	icon: Icon,
	title,
	description,
}: {
	icon: React.ElementType
	title: string
	description: string
}) => (
	<div className="flex flex-col rounded-lg border border-border/40 bg-card/30 p-6 transition-all hover:bg-card/50 hover:shadow-md">
		<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
			<Icon className="h-6 w-6" />
		</div>
		<h3 className="mb-2 text-xl font-medium">{title}</h3>
		<p className="text-muted-foreground">{description}</p>
	</div>
)

const Features = () => (
	<section id="features" className="bg-secondary/20 px-4 py-20">
		<div className="mx-auto max-w-6xl">
			<div className="mb-12 text-center">
				<h2 className="mb-3 text-3xl font-semibold md:text-4xl">
					Powerful Features
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground">
					Everything you need to collaborate effectively on visual projects
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				<FeatureCard
					icon={Globe}
					title="Real-time Collaboration"
					description="Work together with your team in real-time, no matter where they are located. See changes instantly."
				/>
				<FeatureCard
					icon={Users}
					title="Team Management"
					description="Easily manage project access and permissions. Invite members with just a few clicks."
				/>
				<FeatureCard
					icon={Zap}
					title="Streamlined Workflow"
					description="Intuitive tools that reduce friction and help your team focus on what matters most."
				/>
			</div>
		</div>
	</section>
)

const Footer = () => (
	<footer
		id="resources"
		className="border-t border-border/20 bg-card/20 px-4 py-12 text-muted-foreground"
	>
		<div className="mx-auto max-w-6xl">
			<div className="grid grid-cols-1 gap-8 md:grid-cols-4">
				<div className="md:col-span-1">
					<div className="flex items-center gap-2">
						<Image src="/logo.png" alt="Sculpt Logo" width={32} height={32} />
						<span className="text-xl font-semibold text-foreground">
							Sculpt
						</span>
					</div>
					<p className="mt-2 text-sm">
						Empowering teams with visual collaboration tools.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-8 md:col-span-3 md:grid-cols-3">
					<div>
						<h4 className="font-medium text-foreground">Product</h4>
						<ul className="mt-4 space-y-2 text-sm">
							<li>
								<Link
									href="#product"
									className="transition-colors hover:text-primary"
								>
									Overview
								</Link>
							</li>
							<li>
								<Link
									href="#features"
									className="transition-colors hover:text-primary"
								>
									Features
								</Link>
							</li>
							<li>
								<Link href="#" className="transition-colors hover:text-primary">
									Pricing
								</Link>
							</li>
						</ul>
					</div>
					<div>
						<h4 className="font-medium text-foreground">Resources</h4>
						<ul className="mt-4 space-y-2 text-sm">
							<li>
								<Link href="#" className="transition-colors hover:text-primary">
									Documentation
								</Link>
							</li>
							<li>
								<Link href="#" className="transition-colors hover:text-primary">
									Guides
								</Link>
							</li>
							<li>
								<Link href="#" className="transition-colors hover:text-primary">
									Support
								</Link>
							</li>
						</ul>
					</div>
					<div>
						<h4 className="font-medium text-foreground">Company</h4>
						<ul className="mt-4 space-y-2 text-sm">
							<li>
								<Link href="#" className="transition-colors hover:text-primary">
									About
								</Link>
							</li>
							<li>
								<Link
									href="/login"
									className="transition-colors hover:text-primary"
								>
									Sign In
								</Link>
							</li>
							<li>
								<Link
									href="/register"
									className="transition-colors hover:text-primary"
								>
									Sign Up
								</Link>
							</li>
						</ul>
					</div>
				</div>
			</div>
			<div className="mt-12 border-t border-border/20 pt-6 text-sm">
				<div className="flex flex-col justify-between gap-6 md:flex-row">
					<p>&copy; {new Date().getFullYear()} Sculpt. All rights reserved.</p>
					<div className="flex gap-6">
						<Link href="#" className="transition-colors hover:text-primary">
							Terms
						</Link>
						<Link href="#" className="transition-colors hover:text-primary">
							Privacy
						</Link>
						<Link href="#" className="transition-colors hover:text-primary">
							Cookies
						</Link>
					</div>
				</div>
			</div>
		</div>
	</footer>
)

export default function Home() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<Header />
			<Hero />
			<Features />
			<Footer />
		</main>
	)
}
