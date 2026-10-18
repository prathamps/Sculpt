import { AnyToolDefinition } from "../tool-kit.js"
import { accountTools } from "./account.js"
import { projectTools } from "./projects.js"
import { folderTools } from "./folders.js"
import { mediaTools } from "./media.js"
import { commentTools } from "./comments.js"
import { reviewTools } from "./reviews.js"
import { inboxTools } from "./inbox.js"

export const ALL_TOOLS: readonly AnyToolDefinition[] = [
	...accountTools,
	...projectTools,
	...folderTools,
	...mediaTools,
	...commentTools,
	...reviewTools,
	...inboxTools,
]
