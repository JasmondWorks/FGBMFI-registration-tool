import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "./db";
import { cards, pages } from "./db/schema";
import { UserError } from "./http";
import { assertPrintable, markSent, markSpooled } from "./pages";
import { getSpoolStatus, printPdf } from "./print-agent";
import { getPrintSettings } from "./settings";
import { buildSheetsPdf, type SheetPage } from "./sheet-pdf";
import { fetchCardBytes } from "./storage";

/** Loads the badge files for the given pages and builds one PDF with one A4 sheet per page. */
export async function buildPagesPdf(pageIds: string[]) {
  const views = await assertPrintable(pageIds);
  const cardIds = views.flatMap((v) => v.items.map((i) => i.card.id));
  const rows = cardIds.length
    ? await db
        .select({ id: cards.id, mimeType: cards.mimeType, cropBox: cards.cropBox, cloudinaryUrl: cards.cloudinaryUrl })
        .from(cards)
        .where(inArray(cards.id, cardIds))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const sheets: SheetPage[] = [];
  for (const v of views) {
    const slots = [];
    for (const item of v.items) {
      const info = byId.get(item.card.id);
      const bytes = info?.cloudinaryUrl ? await fetchCardBytes(info.cloudinaryUrl) : null;
      if (!info || !bytes) throw new UserError(`The file for ${item.card.fullName} couldn't be fetched from cloud storage`);
      slots.push({ slot: item.slot, bytes: new Uint8Array(bytes), mime: info.mimeType, cropBox: info.cropBox ?? undefined });
    }
    sheets.push({ slots, label: `${v.jobKind === "REPRINT" ? "Reprint " : ""}page ${v.pageNumber}` });
  }
  const settings = await getPrintSettings();
  return { pdf: await buildSheetsPdf(sheets, settings), views, settings };
}

/**
 * Direct mode: each page is its own spooler job, so every sheet gets its own job id
 * and status in the audit trail.
 */
export async function printDirect(pageIds: string[], operator: string) {
  const settings = await getPrintSettings();
  if (!settings.printerName) throw new UserError("Choose a printer in Settings before using direct print");
  const spooler: Record<string, string> = {};
  for (const pageId of pageIds) {
    const { pdf, views } = await buildPagesPdf([pageId]);
    const v = views[0];
    try {
      spooler[pageId] = await printPdf(pdf, settings.printerName, `Badges page ${v.pageNumber}`);
    } catch (err) {
      // Record what did go out before reporting the failure.
      if (Object.keys(spooler).length) await markSent(Object.keys(spooler), operator, "DIRECT", { printerName: settings.printerName, spooler });
      throw new UserError(`Printer refused page ${v.pageNumber}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  await markSent(pageIds, operator, "DIRECT", { printerName: settings.printerName, spooler });
  return spooler;
}

/** Polls the spooler for pages sent in direct mode and records the ones that finished. */
export async function refreshSpoolStatus(pageIds: string[]) {
  const rows = pageIds.length ? await db.select().from(pages).where(inArray(pages.id, pageIds)) : [];
  const result: Record<string, string> = {};
  for (const p of rows) {
    if (p.printMode !== "DIRECT" || !p.spoolerJobId) {
      result[p.id] = p.status;
      continue;
    }
    if (p.status !== "SENT") {
      result[p.id] = p.status;
      continue;
    }
    const s = await getSpoolStatus(p.spoolerJobId);
    if (s === "COMPLETED") {
      await markSpooled(p.id, p.spoolerJobId);
      result[p.id] = "SPOOLED";
    } else {
      result[p.id] = s === "ERROR" ? "PRINTER_ERROR" : p.status;
    }
  }
  return result;
}
