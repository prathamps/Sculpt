/*
  Warnings:

  - You are about to drop the column `parent_id` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `annotations` on the `ImageVersion` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `ImageVersion` table. All the data in the column will be lost.
  - You are about to drop the column `versionName` on the `ImageVersion` table. All the data in the column will be lost.
  - You are about to drop the column `versionNumber` on the `ImageVersion` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - Added the required column `imageUrl` to the `ImageVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hashedPassword` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_parent_id_fkey";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "parent_id",
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "ImageVersion" DROP COLUMN "annotations",
DROP COLUMN "url",
DROP COLUMN "versionName",
DROP COLUMN "versionNumber",
ADD COLUMN     "imageUrl" TEXT NOT NULL,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
DROP COLUMN "role",
ADD COLUMN     "hashedPassword" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "imageVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");

-- CreateIndex
CREATE INDEX "CommentLike_userId_idx" ON "CommentLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "Annotation_imageVersionId_idx" ON "Annotation"("imageVersionId");

-- CreateIndex
CREATE INDEX "Annotation_userId_idx" ON "Annotation"("userId");

-- CreateIndex
CREATE INDEX "Comment_imageVersionId_idx" ON "Comment"("imageVersionId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Image_projectId_idx" ON "Image"("projectId");

-- CreateIndex
CREATE INDEX "ImageVersion_imageId_idx" ON "ImageVersion"("imageId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_imageVersionId_fkey" FOREIGN KEY ("imageVersionId") REFERENCES "ImageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
