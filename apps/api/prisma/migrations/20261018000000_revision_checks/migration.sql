-- CreateEnum
CREATE TYPE "RevisionCheckStatus" AS ENUM ('FIXED', 'NOT_FIXED');

-- CreateTable
CREATE TABLE "RevisionCheck" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "imageVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RevisionCheckStatus" NOT NULL,
    "resolvedComment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevisionCheck_imageVersionId_idx" ON "RevisionCheck"("imageVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionCheck_commentId_imageVersionId_key" ON "RevisionCheck"("commentId", "imageVersionId");

-- AddForeignKey
ALTER TABLE "RevisionCheck" ADD CONSTRAINT "RevisionCheck_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionCheck" ADD CONSTRAINT "RevisionCheck_imageVersionId_fkey" FOREIGN KEY ("imageVersionId") REFERENCES "ImageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionCheck" ADD CONSTRAINT "RevisionCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

