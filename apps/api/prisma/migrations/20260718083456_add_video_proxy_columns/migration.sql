-- CreateEnum
CREATE TYPE "public"."ProxyStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "public"."ImageVersion" ADD COLUMN     "proxyStatus" "public"."ProxyStatus",
ADD COLUMN     "proxyUrl" TEXT;
