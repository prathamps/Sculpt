-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable: User — make password optional + add OAuth fields
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN     "provider" TEXT;
ALTER TABLE "User" ADD COLUMN     "providerId" TEXT;
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- AlterTable: ImageVersion — media type + video duration
ALTER TABLE "ImageVersion" ADD COLUMN     "mediaType" "MediaType" NOT NULL DEFAULT 'IMAGE';
ALTER TABLE "ImageVersion" ADD COLUMN     "duration" DOUBLE PRECISION;

-- AlterTable: Comment — video timestamp anchor
ALTER TABLE "Comment" ADD COLUMN     "timestamp" DOUBLE PRECISION;

-- AlterTable: Notification — persist metadata
ALTER TABLE "Notification" ADD COLUMN     "metadata" JSONB;

-- AlterTable: Subscription — Stripe fields
ALTER TABLE "Subscription" ADD COLUMN     "stripeSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN     "stripePriceId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN     "stripeCurrentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Subscription" ALTER COLUMN "status" SET DEFAULT 'active';

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
