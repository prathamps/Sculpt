-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_projectId_fkey";

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
