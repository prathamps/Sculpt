ALTER TABLE "User" ADD COLUMN     "emailOnMention" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "emailOnComment" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "emailOnReply" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "emailOnReview" BOOLEAN NOT NULL DEFAULT true;
