import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { PDFDocument, rgb, StandardFonts, type PDFPage } from "pdf-lib";

import type { PrintSettings } from "@/lib/types";

/**
 * Builds the A4 sheets that go to the printer.
 *
 * The paper is pre-printed: each quarter of the A4 sheet is a convention card with the
 * header and footer already on it. The platform's A6 badge PDF is a transparent overlay
 * (name, district, chapter, ID, QR) designed for that card, so each badge is placed at
 * ACTUAL SIZE into its quarter. Nothing is scaled unless the source isn't A6.
 *
 *   slot 1 | slot 2        A4 = 210 x 297 mm
 *   -------+-------        each quarter = 105 x 148.5 mm
 *   slot 3 | slot 4        A6 badge = 105 x 148 mm
 */

export const MM = 72 / 25.4;
export const A4 = { w: 210 * MM, h: 297 * MM };
export const QUARTER = { w: A4.w / 2, h: A4.h / 2 };

export type SheetSlot = {
  slot: number; // 1..4
  bytes: Uint8Array;
  mime: string;
  /** For FULL_CARD-format badges: the dynamic (name) region to crop out, in PDF points
   *  (bottom-left origin), so only that region is placed onto the pre-printed stock
   *  instead of the whole baked-in card. Undefined/OVERLAY badges use the full page. */
  cropBox?: { x: number; y: number; width: number; height: number };
};

export type SheetPage = { slots: SheetSlot[]; label?: string };

/** Bottom-left corner of a slot's quarter in PDF coordinates (origin bottom-left). */
export function quarterOrigin(slot: number) {
  const col = (slot - 1) % 2;
  const row = Math.floor((slot - 1) / 2); // 0 = top row
  return { x: col * QUARTER.w, y: A4.h - (row + 1) * QUARTER.h };
}

let templateCache: Uint8Array | null = null;
async function loadTemplate() {
  if (!templateCache) {
    templateCache = await fs.readFile(path.join(process.cwd(), "public", "template", "a4-template.jpg"));
  }
  return templateCache;
}

export async function buildSheetsPdf(sheets: SheetPage[], settings: PrintSettings): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle("FGBMFI badge sheets");
  out.setCreator("Namecard Desk");
  const font = await out.embedFont(StandardFonts.Helvetica);
  const templateImage = settings.printTemplate ? await out.embedJpg(await loadTemplate()) : null;

  const scale = settings.scalePct / 100;
  const dx = settings.offsetXmm * MM;
  const dy = -settings.offsetYmm * MM; // positive Y in settings means "move down"
  const dyRow2 = -settings.offsetYmmRow2 * MM;

  for (const sheet of sheets) {
    const page = out.addPage([A4.w, A4.h]);

    if (templateImage) {
      page.drawImage(templateImage, { x: 0, y: 0, width: A4.w, height: A4.h });
    }

    for (const slot of sheet.slots) {
      const origin = quarterOrigin(slot.slot);
      const isBottomRow = Math.floor((slot.slot - 1) / 2) === 1; // slots 3 & 4
      await drawSlot(out, page, slot, {
        x: origin.x + dx,
        y: origin.y + dy + (isBottomRow ? dyRow2 : 0),
        w: QUARTER.w,
        h: QUARTER.h,
        scale,
      });
    }

    if (settings.cutMarks) drawCutMarks(page);
    if (sheet.label && settings.printTemplate) {
      page.drawText(sheet.label, { x: 8, y: 6, size: 6, font, color: rgb(0.5, 0.5, 0.5) });
    }
  }

  return out.save();
}

async function drawSlot(
  out: PDFDocument,
  page: PDFPage,
  slot: SheetSlot,
  box: { x: number; y: number; w: number; h: number; scale: number },
) {
  if (slot.mime === "application/pdf") {
    let embedded;
    if (slot.cropBox) {
      const src = await PDFDocument.load(slot.bytes);
      const srcPage = src.getPage(0);
      const { x, y, width, height } = slot.cropBox;
      embedded = await out.embedPage(srcPage, { left: x, bottom: y, right: x + width, top: y + height });
    } else {
      [embedded] = await out.embedPdf(slot.bytes, [0]);
    }
    const fit = fitInto(embedded.width, embedded.height, box.w, box.h);
    const w = embedded.width * fit * box.scale;
    const h = embedded.height * fit * box.scale;
    // Top-aligned in the quarter: the badge was laid out against the card's top edge.
    // An A6 badge is 0.5 mm shorter than the quarter, so the gap ends up at the bottom.
    page.drawPage(embedded, { x: box.x + (box.w - w) / 2, y: box.y + box.h - h, width: w, height: h });
    return;
  }
  const image = slot.mime === "image/png" ? await out.embedPng(slot.bytes) : await out.embedJpg(slot.bytes);
  const fit = fitInto(image.width, image.height, box.w, box.h);
  const w = image.width * fit * box.scale;
  const h = image.height * fit * box.scale;
  page.drawImage(image, { x: box.x + (box.w - w) / 2, y: box.y + box.h - h, width: w, height: h });
}

/** 1 when the source already fits (A6 into a quarter); otherwise the largest scale that fits. */
function fitInto(srcW: number, srcH: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / srcW, boxH / srcH);
  return s >= 1 && s < 1.02 ? 1 : s;
}

function drawCutMarks(page: PDFPage) {
  const len = 4 * MM;
  const color = rgb(0.55, 0.55, 0.55);
  const thickness = 0.4;
  const midX = A4.w / 2;
  const midY = A4.h / 2;
  // Ticks at the sheet edges only, so nothing lands on the card artwork.
  page.drawLine({ start: { x: midX, y: 0 }, end: { x: midX, y: len }, thickness, color });
  page.drawLine({ start: { x: midX, y: A4.h }, end: { x: midX, y: A4.h - len }, thickness, color });
  page.drawLine({ start: { x: 0, y: midY }, end: { x: len, y: midY }, thickness, color });
  page.drawLine({ start: { x: A4.w, y: midY }, end: { x: A4.w - len, y: midY }, thickness, color });
}

/** A sheet for lining the printer up: cross-hairs at each quarter's centre and an mm ruler. */
export async function buildCalibrationPdf(settings: PrintSettings): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const page = out.addPage([A4.w, A4.h]);
  if (settings.printTemplate) {
    page.drawImage(await out.embedJpg(await loadTemplate()), { x: 0, y: 0, width: A4.w, height: A4.h });
  }
  const dx = settings.offsetXmm * MM;
  const dy = -settings.offsetYmm * MM;
  const dyRow2 = -settings.offsetYmmRow2 * MM;
  const color = rgb(0.75, 0.1, 0.1);
  for (let slot = 1; slot <= 4; slot++) {
    const o = quarterOrigin(slot);
    const isBottomRow = Math.floor((slot - 1) / 2) === 1;
    // The badge's name baseline sits 193.6 pt above the bottom of the A6 page.
    const nameY = o.y + (QUARTER.h - 419.53) + 193.6 + dy + (isBottomRow ? dyRow2 : 0);
    const cx = o.x + QUARTER.w / 2 + dx;
    page.drawLine({ start: { x: cx - 30 * MM, y: nameY }, end: { x: cx + 30 * MM, y: nameY }, thickness: 0.5, color });
    page.drawLine({ start: { x: cx, y: nameY - 6 * MM }, end: { x: cx, y: nameY + 6 * MM }, thickness: 0.5, color });
    page.drawText("NAME LINE", { x: cx - 30 * MM, y: nameY + 2, size: 6, font, color });
    for (let mm = -25; mm <= 25; mm += 5) {
      const x = cx + mm * MM;
      page.drawLine({ start: { x, y: nameY - 2 * MM }, end: { x, y: nameY }, thickness: 0.3, color });
    }
  }
  page.drawText(
    `Calibration  offset X ${settings.offsetXmm} mm, Y ${settings.offsetYmm} mm, scale ${settings.scalePct}%`,
    { x: 10 * MM, y: A4.h / 2 + 2, size: 7, font, color: rgb(0.3, 0.3, 0.3) },
  );
  return out.save();
}
