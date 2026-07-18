-- AlterEnum
ALTER TYPE "public"."MediaType" ADD VALUE 'MODEL';

-- AlterTable
ALTER TABLE "public"."Comment" ADD COLUMN     "modelAnchor" JSONB;
