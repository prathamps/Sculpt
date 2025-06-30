/*
  Warnings:

  - You are about to drop the column `ownerId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the `_ProjectMembers` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `name` to the `Image` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Image` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'MEMBER');

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectMembers" DROP CONSTRAINT "_ProjectMembers_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectMembers" DROP CONSTRAINT "_ProjectMembers_B_fkey";

-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Untitled Image',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "ownerId";

-- DropTable
DROP TABLE "_ProjectMembers";

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
