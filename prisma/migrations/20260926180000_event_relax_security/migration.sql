-- AlterTable
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "relaxSecurity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ALTER COLUMN "relaxSecurity" SET DEFAULT true;
UPDATE "Event" SET "relaxSecurity" = true WHERE "relaxSecurity" = false;
