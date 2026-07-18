-- AlterEnum
ALTER TYPE "public"."MediaType" ADD VALUE 'PDF';

-- AlterTable
ALTER TABLE "public"."Comment" ADD COLUMN     "page" INTEGER,
ADD COLUMN     "timestampEnd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."ImageVersion" ADD COLUMN     "thumbnailUrl" TEXT;
