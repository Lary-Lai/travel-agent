-- Stable identity for seeded listings, so `prisma db seed` can upsert instead of
-- delete-and-recreate. Existing rows are all NULL and Postgres permits multiple
-- NULLs in a unique index, so this is non-destructive.
ALTER TABLE "Listing" ADD COLUMN "seedKey" TEXT;
CREATE UNIQUE INDEX "Listing_seedKey_key" ON "Listing"("seedKey");
