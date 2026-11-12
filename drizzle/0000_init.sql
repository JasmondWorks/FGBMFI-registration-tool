CREATE TYPE "public"."card_status" AS ENUM('UPLOADED', 'WAITING_TRAY', 'ON_PAGE', 'PRINT_SENT', 'PRINTED', 'DISCARDED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."cloud_status" AS ENUM('PENDING', 'SYNCED', 'FAILED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."extraction_source" AS ENUM('TEXT_LAYER', 'OCR', 'FILENAME_ONLY');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('UPLOAD', 'REPRINT');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('READY', 'SENT', 'SPOOLED', 'CONFIRMED', 'PARTIAL', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."print_mode" AS ENUM('BROWSER', 'DIRECT');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"card_id" uuid,
	"page_id" uuid,
	"job_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"original_filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"local_path" text NOT NULL,
	"page_width_pt" integer,
	"page_height_pt" integer,
	"cloud_status" "cloud_status" DEFAULT 'PENDING' NOT NULL,
	"cloudinary_public_id" text,
	"cloudinary_url" text,
	"cloud_error" text,
	"titles" text[] DEFAULT '{}'::text[] NOT NULL,
	"post_nominals" text[] DEFAULT '{}'::text[] NOT NULL,
	"full_name" text NOT NULL,
	"name_key" text NOT NULL,
	"district" text,
	"chapter" text,
	"registration_id" text,
	"extra_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"badge_size" text,
	"badge_generated_at" timestamp with time zone,
	"filename_name" text,
	"raw_text" text DEFAULT '' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"extraction_source" "extraction_source" NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "card_status" DEFAULT 'UPLOADED' NOT NULL,
	"superseded_by_id" uuid,
	"print_count" integer DEFAULT 0 NOT NULL,
	"first_printed_at" timestamp with time zone,
	"last_printed_at" timestamp with time zone,
	"last_printed_by" text,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "job_kind" NOT NULL,
	"operator" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"printed" boolean,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"status" "page_status" DEFAULT 'READY' NOT NULL,
	"is_underfilled" boolean DEFAULT false NOT NULL,
	"print_mode" "print_mode",
	"printer_name" text,
	"spooler_job_id" text,
	"sent_by" text,
	"confirmed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_items" ADD CONSTRAINT "page_items_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_items" ADD CONSTRAINT "page_items_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_card_idx" ON "audit_events" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "audit_page_idx" ON "audit_events" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cards_file_hash_idx" ON "cards" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "cards_name_key_idx" ON "cards" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "cards_registration_id_idx" ON "cards" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "cards_status_idx" ON "cards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cards_district_idx" ON "cards" USING btree ("district");--> statement-breakpoint
CREATE INDEX "cards_chapter_idx" ON "cards" USING btree ("chapter");--> statement-breakpoint
CREATE INDEX "cards_last_printed_idx" ON "cards" USING btree ("last_printed_at");--> statement-breakpoint
CREATE INDEX "cards_created_idx" ON "cards" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_items_page_slot_idx" ON "page_items" USING btree ("page_id","slot");--> statement-breakpoint
CREATE INDEX "page_items_card_idx" ON "page_items" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "pages_job_idx" ON "pages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");