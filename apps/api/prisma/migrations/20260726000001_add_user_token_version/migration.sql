ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RevokedSession" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedSession_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RevokedSession_expiresAt_idx" ON "RevokedSession"("expiresAt");
