CREATE TYPE "MediaAssetKind" AS ENUM ('ORIGINAL', 'PROXY', 'THUMBNAIL', 'ATTACHMENT');

ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

ALTER TABLE "Review" DROP CONSTRAINT "Review_userId_fkey";
ALTER TABLE "Review" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpPendingSecret" TEXT,
ADD COLUMN "totpSecret" TEXT;

ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT,
ADD COLUMN "prevHash" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "sequence" INTEGER,
ADD COLUMN "userAgent" TEXT;

UPDATE "AuditLog"
SET "sequence" = "ordered"."position"
FROM (
	SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS "position"
	FROM "AuditLog"
) AS "ordered"
WHERE "AuditLog"."id" = "ordered"."id";

ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET NOT NULL;

CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_ipAddress_createdAt_idx" ON "AuditLog"("ipAddress", "createdAt");

CREATE FUNCTION "audit_log_is_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'AuditLog entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_is_append_only"();

ALTER TABLE "Project" ADD COLUMN "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "watermarkViewers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MediaAsset" ADD COLUMN "imageVersionId" TEXT,
ADD COLUMN "kind" "MediaAssetKind" NOT NULL DEFAULT 'ORIGINAL';

CREATE INDEX "MediaAsset_imageVersionId_idx" ON "MediaAsset"("imageVersionId");

UPDATE "MediaAsset" AS "asset"
SET "imageVersionId" = "version"."id"
FROM "ImageVersion" AS "version"
WHERE RIGHT("version"."url", LENGTH("asset"."storedPath") + 1) = '/' || "asset"."storedPath";

UPDATE "MediaAsset" AS "asset"
SET "kind" = 'PROXY', "imageVersionId" = "version"."id"
FROM "ImageVersion" AS "version"
WHERE "version"."proxyUrl" IS NOT NULL
	AND RIGHT("version"."proxyUrl", LENGTH("asset"."storedPath") + 1) = '/' || "asset"."storedPath";

UPDATE "MediaAsset" AS "asset"
SET "kind" = 'THUMBNAIL', "imageVersionId" = "version"."id"
FROM "ImageVersion" AS "version"
WHERE "version"."thumbnailUrl" IS NOT NULL
	AND RIGHT("version"."thumbnailUrl", LENGTH("asset"."storedPath") + 1) = '/' || "asset"."storedPath";

UPDATE "MediaAsset" AS "asset"
SET "kind" = 'ATTACHMENT', "imageVersionId" = "comment"."imageVersionId"
FROM "CommentAttachment" AS "attachment"
JOIN "Comment" AS "comment" ON "comment"."id" = "attachment"."commentId"
WHERE RIGHT("attachment"."url", LENGTH("asset"."storedPath") + 1) = '/' || "asset"."storedPath";

ALTER TABLE "Comment" ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");
CREATE INDEX "MfaRecoveryCode_userId_idx" ON "MfaRecoveryCode"("userId");
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommentRevision" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommentRevision_commentId_createdAt_idx" ON "CommentRevision"("commentId", "createdAt");
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
