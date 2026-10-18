import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z, ZodRawShape } from "zod"
import { McpConfig } from "../config.js"
import { Caller } from "../auth/caller.js"
import { AuthorizationServerError, TokenRejectedError } from "../auth/delegation.js"
import { SculptApi, SculptApiError } from "../sculpt/api-client.js"
import { Scope } from "../scopes.js"
import { logger } from "../logger.js"

export interface ToolContext {
	api: SculptApi
	caller: Caller
	config: McpConfig
}

export type ContentBlock = CallToolResult["content"][number]

export interface ToolResult {
	summary?: string
	data?: unknown
	content?: ContentBlock[]
}

export type ToolEffect = "read" | "write" | "destructive"

export interface ToolDefinition<Shape extends ZodRawShape> {
	name: string
	title: string
	description: string
	scope: Scope
	effect: ToolEffect
	idempotent?: boolean
	input: Shape
	run: (args: z.infer<z.ZodObject<Shape>>, context: ToolContext) => Promise<ToolResult>
}

export type AnyToolDefinition = ToolDefinition<ZodRawShape>

export const defineTool = <Shape extends ZodRawShape>(
	definition: ToolDefinition<Shape>
): AnyToolDefinition => definition as unknown as AnyToolDefinition

export class ToolInputError extends Error {}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value)

export const structuredContentOf = (data: unknown): Record<string, unknown> | undefined => {
	if (data === undefined || data === null) return undefined
	return isPlainObject(data) ? data : { result: data }
}

export const successResult = (result: ToolResult): CallToolResult => {
	const content: ContentBlock[] = []
	if (result.summary) content.push({ type: "text", text: result.summary })
	if (result.data !== undefined) {
		content.push({ type: "text", text: JSON.stringify(result.data) })
	}
	content.push(...(result.content ?? []))
	if (content.length === 0) content.push({ type: "text", text: "Done." })
	const structuredContent = structuredContentOf(result.data)
	return structuredContent ? { content, structuredContent } : { content }
}

export const explainFailure = (error: unknown): string => {
	if (error instanceof ToolInputError) return error.message
	if (error instanceof TokenRejectedError) {
		return "Sculpt has revoked this connection. Ask the person to reconnect Sculpt in their AI assistant."
	}
	if (error instanceof AuthorizationServerError) return error.message
	if (error instanceof SculptApiError) {
		if (error.code === "insufficient_scope") {
			return `This connection was not granted the ${error.requiredScope ?? "required"} permission. Ask the person to reconnect Sculpt and allow it, or to do this in Sculpt themselves.`
		}
		if (error.code === "session_required") return error.message
		if (error.status === 401) {
			return "Sculpt no longer accepts this connection. Ask the person to reconnect Sculpt."
		}
		return `Sculpt refused (HTTP ${error.status}): ${error.message}`
	}
	return "Something went wrong while talking to Sculpt. Try again shortly."
}

export const failureResult = (error: unknown): CallToolResult => ({
	isError: true,
	content: [{ type: "text", text: explainFailure(error) }],
})

export const reachesOutsideSculpt = (tool: Pick<AnyToolDefinition, "input">): boolean =>
	"sourceUrl" in tool.input

export const annotationsFor = (tool: AnyToolDefinition) => ({
	title: tool.title,
	readOnlyHint: tool.effect === "read",
	destructiveHint: tool.effect === "destructive",
	idempotentHint: tool.idempotent ?? tool.effect === "read",
	openWorldHint: reachesOutsideSculpt(tool),
})

export const isAvailableTo = (tool: Pick<AnyToolDefinition, "scope">, caller: Pick<Caller, "scopes">) =>
	caller.scopes.has(tool.scope)

export const registerTools = (
	server: McpServer,
	tools: readonly AnyToolDefinition[],
	context: ToolContext
): string[] => {
	const registered: string[] = []
	for (const tool of tools) {
		if (!isAvailableTo(tool, context.caller)) continue
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.input,
				annotations: annotationsFor(tool),
			},
			async (args: unknown) => {
				try {
					return successResult(await tool.run(args as never, context))
				} catch (error) {
					if (!(error instanceof SculptApiError) && !(error instanceof ToolInputError)) {
						logger.error("Tool failed", error, { tool: tool.name })
					}
					return failureResult(error)
				}
			}
		)
		registered.push(tool.name)
	}
	return registered
}
