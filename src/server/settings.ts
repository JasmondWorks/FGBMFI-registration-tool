import "server-only";

import { z } from "zod";

import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from "@/lib/types";
import { db } from "./db";
import { settings } from "./db/schema";
import { eq, sql } from "drizzle-orm";

const KEY = "print";

export const printSettingsSchema = z.object({
  offsetXmm: z.number().min(-20).max(20),
  offsetYmm: z.number().min(-20).max(20),
  scalePct: z.number().min(90).max(110),
  cutMarks: z.boolean(),
  printTemplate: z.boolean(),
  confirmDelaySec: z.number().int().min(2).max(120),
  printMode: z.enum(["BROWSER", "DIRECT"]),
  printerName: z.string().max(200).nullable(),
});

export async function getPrintSettings(): Promise<PrintSettings> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, KEY) });
  const parsed = printSettingsSchema.partial().safeParse(row?.value ?? {});
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
