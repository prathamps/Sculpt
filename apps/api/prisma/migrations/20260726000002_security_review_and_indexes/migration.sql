CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CHANGES_REQUESTED', 'APPROVED');
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

ALTER TABLE "User" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ImageVersion" ADD COLUMN     "proxyOwner" TEXT,
    ADD COLUMN     "frameRate" DOUBLE PRECISION,
    ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN     "dueAt" TIMESTAMP(3);

ALTER TABLE "ShareLink" ADD COLUMN     "expiresAt" TIMESTAMP(3),
    ADD COLUMN     "maxUses" INTEGER,
    ADD COLUMN     "useCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN     "revokedAt" TIMESTAMP(3);

CREATE TABLE "PasswordResetToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("tokenHash")
);

CREATE TABLE "MediaAsset" (
    "storedPath" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("storedPath")
);

CREATE TABLE "ProjectInvitation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "imageVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "MediaAsset_projectId_idx" ON "MediaAsset"("projectId");
CREATE UNIQUE INDEX "ProjectInvitation_tokenHash_key" ON "ProjectInvitation"("tokenHash");
CREATE UNIQUE INDEX "ProjectInvitation_projectId_email_key" ON "ProjectInvitation"("projectId", "email");
CREATE INDEX "ProjectInvitation_email_idx" ON "ProjectInvitation"("email");
CREATE INDEX "ProjectInvitation_expiresAt_idx" ON "ProjectInvitation"("expiresAt");
CREATE UNIQUE INDEX "Review_imageVersionId_userId_key" ON "Review"("imageVersionId", "userId");
CREATE INDEX "Review_imageVersionId_idx" ON "Review"("imageVersionId");
CREATE INDEX "ShareLink_projectId_idx" ON "ShareLink"("projectId");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_imageVersionId_fkey" FOREIGN KEY ("imageVersionId") REFERENCES "ImageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MediaAsset" ("storedPath", "projectId", "createdAt")
SELECT DISTINCT ON (stored_path) stored_path, "projectId", CURRENT_TIMESTAMP
FROM (
    SELECT regexp_replace(v."url", '^.*/', '') AS stored_path, i."projectId"
    FROM "ImageVersion" v
    JOIN "Image" i ON i."id" = v."imageId"
    WHERE v."url" IS NOT NULL AND v."url" <> ''
    UNION ALL
    SELECT regexp_replace(v."thumbnailUrl", '^.*/', ''), i."projectId"
    FROM "ImageVersion" v
    JOIN "Image" i ON i."id" = v."imageId"
    WHERE v."thumbnailUrl" IS NOT NULL AND v."thumbnailUrl" <> ''
    UNION ALL
    SELECT regexp_replace(v."proxyUrl", '^.*/', ''), i."projectId"
    FROM "ImageVersion" v
    JOIN "Image" i ON i."id" = v."imageId"
    WHERE v."proxyUrl" IS NOT NULL AND v."proxyUrl" <> ''
) AS derived
WHERE stored_path <> ''
ON CONFLICT ("storedPath") DO NOTHING;

DELETE FROM "ImageVersion" a
USING "ImageVersion" b
WHERE a."imageId" = b."imageId"
  AND a."versionNumber" = b."versionNumber"
  AND a."createdAt" > b."createdAt";

ALTER TABLE "ImageVersion" DROP COLUMN IF EXISTS "annotations";

DROP TABLE IF EXISTS "Message";

ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_userId_fkey";
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_userId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ImageVersion_imageId_versionNumber_key" ON "ImageVersion"("imageId", "versionNumber");
CREATE INDEX "ImageVersion_imageId_idx" ON "ImageVersion"("imageId");
CREATE INDEX "ImageVersion_proxyStatus_idx" ON "ImageVersion"("proxyStatus");
CREATE INDEX "Image_projectId_updatedAt_idx" ON "Image"("projectId", "updatedAt");
CREATE INDEX "Image_projectId_name_idx" ON "Image"("projectId", "name");
CREATE INDEX "Comment_imageVersionId_createdAt_idx" ON "Comment"("imageVersionId", "createdAt");
CREATE INDEX "Comment_parent_id_idx" ON "Comment"("parent_id");
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
