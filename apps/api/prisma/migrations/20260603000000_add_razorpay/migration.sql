-- AlterTable: Subscription — pluggable billing provider + Razorpay support
ALTER TABLE "Subscription" ADD COLUMN     "provider" TEXT;
ALTER TABLE "Subscription" ADD COLUMN     "razorpaySubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_razorpaySubscriptionId_key" ON "Subscription"("razorpaySubscriptionId");
