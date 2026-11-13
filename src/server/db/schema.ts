import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const cardStatus = pgEnum("card_status", [
  "UPLOADED", // stored, not on any page yet
  "WAITING_TRAY", // held back to fill the next upload
  "ON_PAGE", // placed on a page that hasn't been printed
  "PRINT_SENT", // print started, waiting for the operator to confirm
  "PRINTED", // confirmed printed at least once
  "DISCARDED", // removed by the operator
  "SUPERSEDED", // replaced by a newer badge for the same person
]);

export const extractionSource = pgEnum("extraction_source", ["TEXT_LAYER", "OCR", "FILENAME_ONLY"]);
export const cloudStatus = pgEnum("cloud_status", ["PENDING", "SYNCED", "FAILED", "DISABLED"]);
export const jobKind = pgEnum("job_kind", ["UPLOAD", "REPRINT", "QUEUE"]);
export const badgeFormat = pgEnum("badge_format", ["OVERLAY", "FULL_CARD"]);
export const pageStatus = pgEnum("page_status", ["READY", "SENT", "SPOOLED", "CONFIRMED", "PARTIAL", "CANCELLED"]);
export const printMode = pgEnum("print_mode", ["BROWSER", "DIRECT"]);

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

/** A print job groups pages: one per upload, or one per reprint request. */
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: jobKind("kind").notNull(),
  operator: text("operator").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One uploaded badge file and everything we know about the person on it. */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),

    // file
    originalFilename: text("original_filename").notNull(),
    fileHash: text("file_hash").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Null for cards saved straight to the cloud (the normal path now) — local disk is
    // only ever a same-request convenience, never something later requests can rely on.
    localPath: text("local_path"),
    pageWidthPt: integer("page_width_pt"),
    pageHeightPt: integer("page_height_pt"),

    // cloud backup
    cloudStatus: cloudStatus("cloud_status").notNull().default("PENDING"),
    cloudinaryPublicId: text("cloudinary_public_id"),
    cloudinaryUrl: text("cloudinary_url"),
    cloudError: text("cloud_error"),

    // identity (from the badge content first, filename second)
    titles: text("titles").array().notNull().default(sql`'{}'::text[]`),
    postNominals: text("post_nominals").array().notNull().default(sql`'{}'::text[]`),
    fullName: text("full_name").notNull(),
    nameKey: text("name_key").notNull(), // order-insensitive, titles removed
    district: text("district"),
    chapter: text("chapter"),
    registrationId: text("registration_id"),
    extraFields: jsonb("extra_fields").$type<Record<string, string>>().notNull().default({}),

    // provenance
    badgeSize: text("badge_size"),
    badgeGeneratedAt: timestamp("badge_generated_at", { withTimezone: true }),
    filenameName: text("filename_name"),
    rawText: text("raw_text").notNull().default(""),
    searchText: text("search_text").notNull().default(""),
    extractionSource: extractionSource("extraction_source").notNull(),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReasons: text("review_reasons").array().notNull().default(sql`'{}'::text[]`),

    // Some registration platforms export the whole card (pre-printed artwork baked in)
    // rather than a transparent name-only overlay. FULL_CARD badges need the dynamic
    // region cropped out before they're placed on pre-printed stock; cropBox holds that
    // region in PDF points (bottom-left origin) once it's been calibrated.
    badgeFormat: badgeFormat("badge_format").notNull().default("OVERLAY"),
    cropBox: jsonb("crop_box").$type<{ x: number; y: number; width: number; height: number }>(),

    // lifecycle
    status: cardStatus("status").notNull().default("UPLOADED"),
    // Manual priority within the print queue. Lower sorts first; null falls back to
    // createdAt (FIFO). Fractional indexing: moving one card only rewrites its own rank.
    queueRank: doublePrecision("queue_rank"),
    supersededById: uuid("superseded_by_id"),
    printCount: integer("print_count").notNull().default(0),
    firstPrintedAt: timestamp("first_printed_at", { withTimezone: true }),
    lastPrintedAt: timestamp("last_printed_at", { withTimezone: true }),
    lastPrintedBy: text("last_printed_by"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cards_file_hash_idx").on(t.fileHash),
    index("cards_name_key_idx").on(t.nameKey),
    index("cards_registration_id_idx").on(t.registrationId),
    index("cards_status_idx").on(t.status),
    index("cards_district_idx").on(t.district),
    index("cards_chapter_idx").on(t.chapter),
    index("cards_last_printed_idx").on(t.lastPrintedAt),
    index("cards_created_idx").on(t.createdAt),
    index("cards_queue_rank_idx").on(t.queueRank),
  ],
);

/** One A4 sheet with up to 4 badges. */
export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    status: pageStatus("status").notNull().default("READY"),
    isUnderfilled: boolean("is_underfilled").notNull().default(false),
    printMode: printMode("print_mode"),
    printerName: text("printer_name"),
    spoolerJobId: text("spooler_job_id"),
    sentBy: text("sent_by"),
    confirmedBy: text("confirmed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [index("pages_job_idx").on(t.jobId), index("pages_status_idx").on(t.status)],
);

export const pageItems = pgTable(
  "page_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id),
    slot: integer("slot").notNull(), // 1..4, reading order: top-left, top-right, bottom-left, bottom-right
    printed: boolean("printed"), // null until the operator confirms
    note: text("note"),
  },
  (t) => [uniqueIndex("page_items_page_slot_idx").on(t.pageId, t.slot), index("page_items_card_idx").on(t.cardId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    cardId: uuid("card_id"),
    pageId: uuid("page_id"),
    jobId: uuid("job_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_card_idx").on(t.cardId), index("audit_page_idx").on(t.pageId), index("audit_created_idx").on(t.createdAt)],
);

/**
 * A file between "analyzed" and "accepted into a card" (the duplicate-review step in
 * between can take a while, and happens as a separate request from the one that analyzed
 * it, so it can't just live in memory). Short-lived: cleaned up well after the 24h TTL
 * used to expire an unreviewed upload.
 */
export const stagingFiles = pgTable("staging_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  bytes: bytea("bytes").notNull(),
  mime: text("mime").notNull(),
  ext: text("ext").notNull(),
  meta: jsonb("meta").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type PageItem = typeof pageItems.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type CardStatus = (typeof cardStatus.enumValues)[number];
export type PageStatus = (typeof pageStatus.enumValues)[number];
