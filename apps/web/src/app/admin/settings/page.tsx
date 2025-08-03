import { AdminLayout } from "@/components/AdminLayout"

export default function AdminSettingsPage() {
	return (
		<AdminLayout>
			<div className="p-6">
				<h1 className="text-2xl font-bold mb-6">Admin Settings</h1>

				<div className="space-y-6">
					<div className="border rounded-md p-6">
						<h2 className="text-lg font-medium mb-4">System Configuration</h2>
						<p className="text-muted-foreground">
							System settings and configuration options will be available here
							in future updates.
						</p>
					</div>

					<div className="border rounded-md p-6">
						<h2 className="text-lg font-medium mb-4">Email Settings</h2>
						<p className="text-muted-foreground">
							Email template and notification configuration will be available
							here in future updates.
						</p>
					</div>

					<div className="border rounded-md p-6">
						<h2 className="text-lg font-medium mb-4">Security Settings</h2>
						<p className="text-muted-foreground">
							Security policy and access control configuration will be available
							here in future updates.
						</p>
					</div>
				</div>
			</div>
		</AdminLayout>
	)
}
