import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ToolContext } from "./tool-kit.js"
import { Version, fetchPreview } from "./tools/media.js"
import { pathSegment } from "./inputs.js"

const JSON_MIME = "application/json"

interface ProjectSummary {
	id: string
	name: string
}

const jsonContents = (uri: URL, value: unknown) => ({
	contents: [{ uri: uri.href, mimeType: JSON_MIME, text: JSON.stringify(value, null, 2) }],
})

const variable = (value: string | string[] | undefined): string =>
	(Array.isArray(value) ? value[0] : value) ?? ""

export const registerResources = (server: McpServer, context: ToolContext): void => {
	if (!context.caller.scopes.has("sculpt:read")) return
	const { api } = context

	server.registerResource(
		"projects",
		"sculpt://projects",
		{ title: "Your projects", description: "Every project you belong to, with your role.", mimeType: JSON_MIME },
		async (uri) => jsonContents(uri, await api.get("/api/projects", { pageSize: 100 }))
	)

	server.registerResource(
		"project",
		new ResourceTemplate("sculpt://projects/{projectId}", {
			list: async () => {
				const { items } = await api.get<{ items: ProjectSummary[] }>("/api/projects", { pageSize: 100 })
				return {
					resources: items.map((project) => ({
						uri: `sculpt://projects/${project.id}`,
						name: project.name,
						mimeType: JSON_MIME,
					})),
				}
			},
		}),
		{ title: "Project", description: "A project's details, folders and media.", mimeType: JSON_MIME },
		async (uri, variables) => {
			const projectId = pathSegment(variable(variables.projectId))
			const [project, folders, media] = await Promise.all([
				api.get(`/api/projects/${projectId}`),
				api.get(`/api/projects/${projectId}/folders`),
				api.get(`/api/projects/${projectId}/images`, { page: 1, pageSize: 200 }),
			])
			return jsonContents(uri, { project, folders, media })
		}
	)

	server.registerResource(
		"version",
		new ResourceTemplate("sculpt://versions/{versionId}", { list: undefined }),
		{ title: "Version with feedback", description: "A version with its comment threads and review decisions.", mimeType: JSON_MIME },
		async (uri, variables) => {
			const versionId = pathSegment(variable(variables.versionId))
			const [version, comments, reviews] = await Promise.all([
				api.get(`/api/images/versions/${versionId}`),
				api.get(`/api/images/versions/${versionId}/comments`, { pageSize: 100 }),
				api.get(`/api/images/versions/${versionId}/reviews`),
			])
			return jsonContents(uri, { version, comments, reviews })
		}
	)

	server.registerResource(
		"version-preview",
		new ResourceTemplate("sculpt://versions/{versionId}/preview", { list: undefined }),
		{ title: "Version preview", description: "The version as an image." },
		async (uri, variables) => {
			const version = await api.get<Version>(
				`/api/images/versions/${pathSegment(variable(variables.versionId))}`
			)
			const preview = await fetchPreview(version, context)
			if (!preview) return { contents: [] }
			return {
				contents: [{ uri: uri.href, mimeType: preview.mimeType, blob: preview.bytes.toString("base64") }],
			}
		}
	)
}
