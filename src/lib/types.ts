/**
 * Types shared by the server routes and the client. Dates travel as ISO strings.
 */
import type { CardStatus, PageStatus } from "@/server/db/schema";

export type { CardStatus, PageStatus };

export type PrintSettings = {
  /** Shift everything on the sheet to correct printer drift. Positive X = right, positive Y = down. */
  offsetXmm: number;
  offsetYmm: number;
  /** Extra Y shift for the bottom row only (slots 3 & 4), on top of offsetYmm. Printers often
   *  drift more on the trailing edge of the sheet, so the two rows can need different corrections. */
  offsetYmmRow2: number;
  /** 100 = actual size. Only change if the printer scales consistently. */
  scalePct: number;
  /** Small cut guides at the sheet edges. Off by default because the stock is pre-printed. */
  cutMarks: boolean;
  /** Print the template artwork under the badge data. For test prints on plain paper only. */
  printTemplate: boolean;
  /** Seconds after printing before the "did it print?" check appears. */
  confirmDelaySec: number;
  printMode: "BROWSER" | "DIRECT";
  printerName: string | null;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  offsetXmm: 0,
  offsetYmm: 0,
  offsetYmmRow2: 0,
  scalePct: 100,
  cutMarks: false,
  printTemplate: false,
  confirmDelaySec: 8,
  printMode: "BROWSER",
  printerName: null,
};

export type DuplicateMatchType = "EXACT_FILE" | "SAME_REG_ID" | "NEWER_VERSION" | "OLDER_VERSION" | "SAME_NAME";

export type CardSummary = {
  id: string;
  fullName: string;
  titles: string[];
  district: string | null;
  chapter: string | null;
  registrationId: string | null;
  status: CardStatus;
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
  badgeGeneratedAt: string | null;
  originalFilename: string;
  needsReview: boolean;
  reviewReasons: string[];
  uploadedBy: string;
  createdAt: string;
  mimeType: string;
  extraFields: Record<string, string>;
  cloudStatus: "PENDING" | "SYNCED" | "FAILED" | "DISABLED";
  badgeFormat: "OVERLAY" | "FULL_CARD";
  cropBox: { x: number; y: number; width: number; height: number } | null;
  pageWidthPt: number | null;
  pageHeightPt: number | null;
};

export type DuplicateMatch = {
  type: DuplicateMatchType;
  /** 3 = certain, 2 = strong, 1 = possible */
  strength: 1 | 2 | 3;
  label: string;
  existing: CardSummary;
};

/** Result of analysing one file before it is committed to the system. */
export type AnalyzedFile = {
  stagingId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
  fullName: string;
  titles: string[];
  district: string | null;
  chapter: string | null;
  registrationId: string | null;
  badgeGeneratedAt: string | null;
  extractionSource: "TEXT_LAYER" | "OCR" | "FILENAME_ONLY";
  needsReview: boolean;
  reviewReasons: string[];
  duplicates: DuplicateMatch[];
};

export type PageItemView = {
  itemId: string;
  slot: number;
  printed: boolean | null;
  card: CardSummary;
};

export type PageView = {
  id: string;
  jobId: string;
  jobKind: "UPLOAD" | "REPRINT" | "QUEUE";
  jobReason: string | null;
  pageNumber: number;
  status: PageStatus;
  isUnderfilled: boolean;
  printMode: "BROWSER" | "DIRECT" | null;
  printerName: string | null;
  spoolerJobId: string | null;
  sentBy: string | null;
  confirmedBy: string | null;
  createdAt: string;
  sentAt: string | null;
  confirmedAt: string | null;
  items: PageItemView[];
};

export type JobView = {
  id: string;
  kind: "UPLOAD" | "REPRINT" | "QUEUE";
  operator: string;
  reason: string | null;
  createdAt: string;
  pages: PageView[];
  /** Cards in this job that are not on a page yet (only when the count isn't a multiple of 4). */
  unplaced: CardSummary[];
};

export type AuditEntry = {
  id: number;
  type: string;
  actor: string;
  createdAt: string;
  pageId: string | null;
  jobId: string | null;
  payload: Record<string, unknown>;
};

export type CardDetail = CardSummary & {
  postNominals: string[];
  filenameName: string | null;
  extractionSource: "TEXT_LAYER" | "OCR" | "FILENAME_ONLY";
  rawText: string;
  supersededById: string | null;
  supersedes: { id: string; fullName: string } | null;
  firstPrintedAt: string | null;
  cloudinaryUrl: string | null;
  history: AuditEntry[];
  pages: { pageId: string; jobKind: "UPLOAD" | "REPRINT" | "QUEUE"; pageNumber: number; status: PageStatus; slot: number; printed: boolean | null; sentAt: string | null }[];
};

export type Facets = {
  district: { value: string; count: number }[];
  chapter: { value: string; count: number }[];
  title: { value: string; count: number }[];
  status: { value: string; count: number }[];
  printedBy: { value: string; count: number }[];
  extra: Record<string, { value: string; count: number }[]>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
