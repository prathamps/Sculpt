ALTER TABLE "OAuthClient" ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE TABLE "OAuthConsumedRequest" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthConsumedRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OAuthConsumedRequest_expiresAt_idx" ON "OAuthConsumedRequest"("expiresAt");

ALTER TABLE "OAuthGrant" ADD COLUMN "requestedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
