/*
  Warnings:

  - You are about to drop the column `parentId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `imageUrl` on the `ImageVersion` table. All the data in the column will be lost.
  - You are about to drop the column `isApproved` on the `ImageVersion` table. All the data in the column will be lost.
  - You are about to drop the column `hashedPassword` on the `User` table. All the data in the column will be lost.
  - Added the required column `url` to the `ImageVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_parentId_fkey";

-- DropIndex
DROP INDEX "Comment_parentId_idx";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "parentId",
ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "ImageVersion" DROP COLUMN "imageUrl",
DROP COLUMN "isApproved",
ADD COLUMN     "url" TEXT NOT NULL,
ADD COLUMN     "versionName" TEXT NOT NULL DEFAULT 'Version 1',
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "hashedPassword",
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "Comment_parent_id_idx" ON "Comment"("parent_id");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
