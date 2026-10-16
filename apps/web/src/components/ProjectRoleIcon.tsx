import { BadgeAlert, Shield, ShieldCheck, ShieldX } from "lucide-react"

export function ProjectRoleIcon({ role }: { role: string }) {
	switch (role) {
		case "OWNER":
			return <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
		case "EDITOR":
			return <Shield className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
		case "VIEWER":
			return <ShieldX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
		default:
			return <BadgeAlert className="h-3.5 w-3.5" aria-hidden="true" />
	}
}
