CREATE TYPE "public"."badge_format" AS ENUM('OVERLAY', 'FULL_CARD');--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'QUEUE';--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "badge_format" "badge_format" DEFAULT 'OVERLAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "crop_box" jsonb;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "queue_rank" double precision;--> statement-breakpoint
CREATE INDEX "cards_queue_rank_idx" ON "cards" USING btree ("queue_rank");