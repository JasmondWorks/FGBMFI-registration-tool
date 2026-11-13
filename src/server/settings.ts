import "server-only";

import { z } from "zod";

import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from "@/lib/types";
import { db } from "./db";
import { settings } from "./db/schema";
import { eq, sql } from "drizzle-orm";

const KEY = "print";

export const printSettingsSchema = z.object({
  offsetXmmRow1: z.number().min(-20).max(20),
  offsetYmmRow1: z.number().min(-20).max(20),
  offsetXmmRow2: z.number().min(-20).max(20),
  offsetYmmRow2: z.number().min(-20).max(20),
  scalePct: z.number().min(90).max(110),
  cutMarks: z.boolean(),
  printTemplate: z.boolean(),
  confirmDelaySec: z.number().int().min(2).max(120),
  printMode: z.enum(["BROWSER", "DIRECT"]),
  printerName: z.string().max(200).nullable(),
});

/** Reads a value saved before each row got its own X offset (single shared X, shared Y
 *  plus an extra Y just for the bottom row) and maps it onto the new per-row shape,
 *  preserving the actual calibrated effect instead of silently resetting it to 0. */
function migrateLegacyOffsets(raw: Record<string, unknown>): Record<string, unknown> {
  if ("offsetXmmRow1" in raw || !("offsetXmm" in raw || "offsetYmm" in raw)) return raw;
  const x = typeof raw.offsetXmm === "number" ? raw.offsetXmm : 0;
  const y = typeof raw.offsetYmm === "number" ? raw.offsetYmm : 0;
  const yRow2Extra = typeof raw.offsetYmmRow2 === "number" ? raw.offsetYmmRow2 : 0;
  const rest = { ...raw };
  delete rest.offsetXmm;
  delete rest.offsetYmm;
  return { ...rest, offsetXmmRow1: x, offsetYmmRow1: y, offsetXmmRow2: x, offsetYmmRow2: y + yRow2Extra };
}

export async function getPrintSettings(): Promise<PrintSettings> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, KEY) });
  const migrated = migrateLegacyOffsets((row?.value as Record<string, unknown>) ?? {});
  const parsed = printSettingsSchema.partial().safeParse(migrated);
  return { ...DEFAULT_PRINT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export async function savePrintSettings(next: PrintSettings): Promise<PrintSettings> {
  const value = printSettingsSchema.parse(next);
  await db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
  return value;
}
