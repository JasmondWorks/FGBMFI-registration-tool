import { formatDistanceToNowStrict, format } from "date-fns";

import type { CardStatus, PageStatus } from "./types";

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function exactTime(iso: string | null | undefined) {
  if (!iso) return "";
  return format(new Date(iso), "d MMM yyyy, HH:mm:ss");
}

export function shortTime(iso: string | null | undefined) {
  if (!iso) return "";
  return format(new Date(iso), "d MMM, HH:mm");
}

export function personLabel(c: { titles: string[]; fullName: string }) {
  return [c.titles.join(" "), c.fullName].filter(Boolean).join(" ");
}

type Tone = "success" | "warning" | "danger" | "info" | "secondary" | "outline";

export const CARD_STATUS: Record<CardStatus, { label: string; tone: Tone }> = {
  UPLOADED: { label: "Not printed", tone: "secondary" },
  WAITING_TRAY: { label: "Waiting tray", tone: "info" },
  ON_PAGE: { label: "On a sheet", tone: "info" },
  PRINT_SENT: { label: "Awaiting check", tone: "warning" },
  PRINTED: { label: "Printed", tone: "success" },
  GIVEN_OUT: { label: "Given out", tone: "success" },
  DISCARDED: { label: "Removed", tone: "outline" },
  SUPERSEDED: { label: "Replaced", tone: "outline" },
};

export const PAGE_STATUS: Record<PageStatus, { label: string; tone: Tone }> = {
  READY: { label: "Ready", tone: "secondary" },
  SENT: { label: "Awaiting check", tone: "warning" },
  SPOOLED: { label: "Spooled", tone: "info" },
  CONFIRMED: { label: "Printed", tone: "success" },
  PARTIAL: { label: "Partly printed", tone: "warning" },
  CANCELLED: { label: "Not printed", tone: "danger" },
};

export const FILTER_STATUS_LABELS: Record<string, string> = {
  PRINTED: "Printed",
  NOT_PRINTED: "Not printed yet",
  REPRINTED: "Printed more than once",
  PRINT_SENT: "Awaiting check",
  WAITING_TRAY: "Waiting tray",
  SUPERSEDED: "Replaced by newer badge",
};

export const AUDIT_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  DUPLICATE_FLAGGED: "Flagged as duplicate",
  DUPLICATE_EXCLUDED: "Duplicate excluded",
  SUPERSEDED: "Replaced by a newer badge",
  PAGE_CREATED: "Placed on a sheet",
  PRINT_SENT: "Sent to printer",
  PRINT_SPOOLED: "Printer finished the job",
  PRINT_CONFIRMED: "Confirmed printed",
  PRINT_FAILED: "Marked as failed print",
  PRINT_CANCELLED: "Print cancelled",
  REPRINT_REQUESTED: "Reprint requested",
  FIELD_EDITED: "Details edited",
  VIEWED: "Viewed",
  MOVED_TO_TRAY: "Waiting tray",
  TRAY_CLEARED: "Released from tray",
  UNDERFILLED_OVERRIDE: "Printed on a part-filled sheet",
  DISCARDED: "Removed",
  CLOUD_SYNCED: "Backed up to cloud",
  CLOUD_FAILED: "Cloud backup failed",
  GIVEN_OUT: "Given out to its owner",
  GIVEN_OUT_UNDONE: "Given-out mark undone",
};
