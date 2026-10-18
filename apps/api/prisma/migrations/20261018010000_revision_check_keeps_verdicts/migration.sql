ALTER TABLE "RevisionCheck" DROP CONSTRAINT "RevisionCheck_userId_fkey";
ALTER TABLE "RevisionCheck" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "RevisionCheck" ADD CONSTRAINT "RevisionCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
