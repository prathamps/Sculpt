/*
  Warnings:

  - You are about to drop the column `metadata` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the `Annotation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_imageVersionId_fkey";

-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_userId_fkey";

-- DropIndex
DROP INDEX "Comment_imageVersionId_idx";

-- DropIndex
DROP INDEX "Comment_parent_id_idx";

-- DropIndex
DROP INDEX "Comment_userId_idx";

-- DropIndex
DROP INDEX "CommentLike_commentId_idx";

-- DropIndex
DROP INDEX "CommentLike_userId_idx";

-- DropIndex
DROP INDEX "Image_projectId_idx";

-- DropIndex
DROP INDEX "ImageVersion_imageId_idx";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "metadata";

-- AlterTable
ALTER TABLE "ImageVersion" ADD COLUMN     "annotations" JSONB[];

-- DropTable
DROP TABLE "Annotation";
