CREATE TABLE "staging_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"ext" text NOT NULL,
	"meta" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "local_path" DROP NOT NULL;