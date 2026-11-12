-- Fast "contains" search over names, chapters, districts, IDs, filenames and badge text.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_search_text_trgm_idx" ON "cards" USING gin ("search_text" gin_trgm_ops);
