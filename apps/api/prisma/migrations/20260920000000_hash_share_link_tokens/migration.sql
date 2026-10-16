CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "ShareLink" ADD COLUMN "tokenHash" TEXT;

UPDATE "ShareLink"
SET "tokenHash" = encode(digest("token", 'sha256'), 'hex')
WHERE "token" IS NOT NULL;

DELETE FROM "ShareLink" WHERE "tokenHash" IS NULL;

ALTER TABLE "ShareLink" ALTER COLUMN "tokenHash" SET NOT NULL;

DROP INDEX IF EXISTS "ShareLink_token_key";

ALTER TABLE "ShareLink" DROP COLUMN "token";

CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
