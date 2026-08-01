import { z } from "zod"

export const MAX_COMMENT_LENGTH = 5000
const MAX_ANNOTATION_POINTS = 5000
const MAX_ANNOTATIONS_PER_COMMENT = 50

const finiteNumber = z.number().finite()

const annotationPointSchema = z.object({
	x: finiteNumber,
	y: finiteNumber,
})

const annotationSchema = z.object({
	id: finiteNumber.optional(),
	type: z.enum(["pencil", "rect", "line"]),
	color: z.string().max(32).optional(),
	points: z.array(annotationPointSchema).max(MAX_ANNOTATION_POINTS),
	t: finiteNumber.nonnegative().optional(),
	tEnd: finiteNumber.nonnegative().optional(),
	page: z.number().int().positive().max(10000).optional(),
	isHighlighted: z.boolean().optional(),
	dimmed: z.boolean().optional(),
})

const annotationPayloadSchema = z.union([
	annotationSchema,
	z.array(annotationSchema).max(MAX_ANNOTATIONS_PER_COMMENT),
])

const vec3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber])

const modelAnchorSchema = z.object({
	position: vec3Schema,
	normal: vec3Schema.nullish(),
	camera: z
		.object({
			position: vec3Schema,
			target: vec3Schema,
		})
		.nullish(),
})

export const createCommentSchema = z.object({
	content: z
		.string()
		.trim()
		.min(1, "Comment cannot be empty")
		.max(MAX_COMMENT_LENGTH),
	parentId: z.string().nullish(),
	annotation: annotationPayloadSchema.nullish(),
	timestamp: finiteNumber.nonnegative().nullish(),
	timestampEnd: finiteNumber.nonnegative().nullish(),
	page: z.number().int().positive().max(10000).nullish(),
	modelAnchor: modelAnchorSchema.nullish(),
	mentionedUserIds: z.array(z.string().max(64)).max(30).optional(),
	internal: z.boolean().optional(),
})

export const updateCommentSchema = z.object({
	content: z
		.string()
		.trim()
		.min(1, "Comment cannot be empty")
		.max(MAX_COMMENT_LENGTH),
})
