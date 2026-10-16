WITH RECURSIVE "ancestry" AS (
	SELECT "child"."id", "parent"."parent_id" AS "rootId"
	FROM "Comment" AS "child"
	JOIN "Comment" AS "parent" ON "parent"."id" = "child"."parent_id"
	WHERE "parent"."parent_id" IS NOT NULL
	UNION ALL
	SELECT "ancestry"."id", "parent"."parent_id"
	FROM "ancestry"
	JOIN "Comment" AS "parent" ON "parent"."id" = "ancestry"."rootId"
	WHERE "parent"."parent_id" IS NOT NULL
)
UPDATE "Comment"
SET "parent_id" = "ancestry"."rootId"
FROM "ancestry"
JOIN "Comment" AS "root" ON "root"."id" = "ancestry"."rootId" AND "root"."parent_id" IS NULL
WHERE "Comment"."id" = "ancestry"."id";

CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE INDEX "Image_projectId_folderId_createdAt_idx" ON "Image"("projectId", "folderId", "createdAt");
