import "server-only";

import { db, type Tx } from "./db";
import { auditEvents } from "./db/schema";

export type AuditType =
  | "UPLOADED"
  | "DUPLICATE_FLAGGED"
  | "DUPLICATE_EXCLUDED"
  | "SUPERSEDED"
  | "PAGE_CREATED"
  | "PRINT_SENT"
  | "PRINT_SPOOLED"
  | "PRINT_CONFIRMED"
  | "PRINT_FAILED"
  | "PRINT_CANCELLED"
  | "REPRINT_REQUESTED"
  | "FIELD_EDITED"
  | "VIEWED"
  | "MOVED_TO_TRAY"
  | "TRAY_CLEARED"
  | "UNDERFILLED_OVERRIDE"
  | "DISCARDED"
  | "CLOUD_SYNCED"
  | "CLOUD_FAILED"
  | "RECONCILED_PRINTED";

export type AuditInput = {
  type: AuditType;
  actor: string;
  cardId?: string | null;
  pageId?: string | null;
  jobId?: string | null;
  payload?: Record<string, unknown>;
};

export async function logEvents(events: AuditInput[], tx?: Tx) {
  if (events.length === 0) return;
  const runner = tx ?? db;
  await runner.insert(auditEvents).values(
    events.map((e) => ({
      type: e.type,
      actor: e.actor,
      cardId: e.cardId ?? null,
      pageId: e.pageId ?? null,
      jobId: e.jobId ?? null,
      payload: e.payload ?? {},
    })),
  );
}

export function logEvent(event: AuditInput, tx?: Tx) {
  return logEvents([event], tx);
}
