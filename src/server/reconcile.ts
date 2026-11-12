import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { canonicalName, nameKey } from "@/lib/badge/normalize";
import { splitTitles } from "@/lib/badge/titles";
import { logEvents } from "./audit";
import { db } from "./db";
import { cards, type Card } from "./db/schema";
import { toCardSummary } from "./mappers";
import { UserError } from "./http";

/**
 * Reconciliation: confirm a badge has already been printed and given out, by
 * photographing the physical card instead of relying on the system's own print
 * records. Useful when badges were printed before the desk was tracking them, or
 * printed from somewhere else entirely. OCR reads what's on the card; the printed
 * ID is the most reliable match key since it's already a unique field on every
 * badge, with name as a fallback when the ID can't be read.
 */

export type ScanResult = {
  rawText: string;
  extractedName: string | null;
  extractedId: string | null;
  extractedDistrict: string | null;
  extractedChapter: string | null;
  match: ReturnType<typeof toCardSummary> | null;
  matchedBy: "ID" | "NAME" | null;
  alreadyPrinted: boolean;
};

async function ocrText(bytes: Uint8Array): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(Buffer.from(bytes));
    return text;
  } finally {
    await worker.terminate();
  }
}

/** Pulls the fields we know this badge template prints, straight off their labels. */
function parseScannedText(rawText: string) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const idLine = lines.find((l) => /^id\s*[:\-]/i.test(l));
  const extractedId = idLine ? idLine.replace(/^id\s*[:\-]\s*/i, "").replace(/\s+/g, "") || null : null;

  const districtLine = lines.find((l) => /^district\s*[:\-]/i.test(l));
  const extractedDistrict = districtLine ? districtLine.replace(/^district\s*[:\-]\s*/i, "").trim() || null : null;

  const chapterLine = lines.find((l) => /^chapter\s*[:\-]/i.test(l));
  const extractedChapter = chapterLine ? chapterLine.replace(/^chapter\s*[:\-]\s*/i, "").trim() || null : null;

  // The name is the all-caps line right before "District:" (or the first all-caps line
  // that isn't the org/convention header text, if OCR missed the District line).
  const districtIdx = lines.findIndex((l) => /^district\s*[:\-]/i.test(l));
  const isHeaderNoise = (l: string) =>
    /full gospel|business men|fellowship|convention|pressing toward|theme|regular|guest|member/i.test(l);
  let nameLine: string | null = null;
  if (districtIdx > 0) {
    for (let i = districtIdx - 1; i >= 0 && i >= districtIdx - 3; i--) {
      if (!isHeaderNoise(lines[i]) && /[a-z]/i.test(lines[i])) {
        nameLine = lines[i];
        break;
      }
    }
  }
  if (!nameLine) {
    nameLine = lines.find((l) => !isHeaderNoise(l) && /^[A-Z][A-Z\s.'-]{3,}$/.test(l)) ?? null;
  }
  const extractedName = nameLine ? canonicalName(splitTitles(nameLine).name) : null;

  return { extractedName, extractedId, extractedDistrict, extractedChapter };
}

export async function scanPrintedBadge(bytes: Uint8Array): Promise<ScanResult> {
  const rawText = await ocrText(bytes);
  const { extractedName, extractedId, extractedDistrict, extractedChapter } = parseScannedText(rawText);

  let row: Card | undefined;
  let matchedBy: "ID" | "NAME" | null = null;
  if (extractedId) {
    row = await db.query.cards.findFirst({ where: and(eq(cards.registrationId, extractedId), ne(cards.status, "DISCARDED")) });
    if (row) matchedBy = "ID";
  }
  if (!row && extractedName) {
    row = await db.query.cards.findFirst({ where: and(eq(cards.nameKey, nameKey(extractedName)), ne(cards.status, "DISCARDED")) });
    if (row) matchedBy = "NAME";
  }

  return {
    rawText,
    extractedName,
    extractedId,
    extractedDistrict,
    extractedChapter,
    match: row ? toCardSummary(row) : null,
    matchedBy,
    alreadyPrinted: row ? row.status === "PRINTED" || row.printCount > 0 : false,
  };
}

/** Marks matched-but-unprinted cards as printed, confirmed via photo instead of the normal print flow. */
export async function confirmDispatched(cardIds: string[], operator: string) {
  if (cardIds.length === 0) return { updated: 0 };
  const rows = await db.query.cards.findMany({ where: inArray(cards.id, cardIds) });
  const toUpdate = rows.filter((c) => c.status !== "PRINTED" && c.status !== "DISCARDED");
  if (toUpdate.length === 0) return { updated: 0 };

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const c of toUpdate) {
      await tx
        .update(cards)
        .set({
          status: "PRINTED",
          printCount: c.printCount + 1,
          firstPrintedAt: c.firstPrintedAt ?? now,
          lastPrintedAt: now,
          lastPrintedBy: operator,
          updatedAt: now,
        })
        .where(eq(cards.id, c.id));
      await logEvents(
        [{ type: "RECONCILED_PRINTED", actor: operator, cardId: c.id, payload: { fullName: c.fullName, source: "camera-reconciliation" } }],
        tx,
      );
    }
  });
  return { updated: toUpdate.length };
}

/** Adds a badge that wasn't in the system at all, discovered by reconciliation: its file is
 *  uploaded like normal intake, but it's saved straight to PRINTED since it's already out. */
export async function addReconciledCard(input: { stagingId: string; operator: string }) {
  const { readStagingMeta, promoteStaging } = await import("./storage");
  type StagingMeta = {
    originalFilename: string;
    sizeBytes: number;
    extraction: {
      fileHash: string;
      titles: string[];
      postNominals: string[];
      fullName: string;
      nameKey: string;
      district: string | null;
      chapter: string | null;
      registrationId: string | null;
      extraFields: Record<string, string>;
      badgeSize: string | null;
      badgeGeneratedAt: string | null;
      filenameName: string | null;
      rawText: string;
      searchText: string;
      extractionSource: "TEXT_LAYER" | "OCR" | "FILENAME_ONLY";
      pageWidthPt: number | null;
      pageHeightPt: number | null;
      needsReview: boolean;
      reviewReasons: string[];
      badgeFormat: "OVERLAY" | "FULL_CARD";
    };
    ext: string;
    mime: string;
  };
  const meta = await readStagingMeta<StagingMeta>(input.stagingId);
  if (!meta) throw new UserError("That file expired before it was added. Please upload it again.");

  const id = crypto.randomUUID();
  const localPath = await promoteStaging(input.stagingId, id, meta.ext);
  const x = meta.extraction;
  const now = new Date();
  const [card] = await db
    .insert(cards)
    .values({
      id,
      jobId: null,
      originalFilename: meta.originalFilename,
      fileHash: x.fileHash,
      mimeType: meta.mime,
      sizeBytes: meta.sizeBytes,
      localPath,
      pageWidthPt: x.pageWidthPt,
      pageHeightPt: x.pageHeightPt,
      titles: x.titles,
      postNominals: x.postNominals,
      fullName: x.fullName,
      nameKey: x.nameKey,
      district: x.district,
      chapter: x.chapter,
      registrationId: x.registrationId,
      extraFields: x.extraFields,
      badgeSize: x.badgeSize,
      badgeGeneratedAt: x.badgeGeneratedAt ? new Date(x.badgeGeneratedAt) : null,
      filenameName: x.filenameName,
      rawText: x.rawText,
      searchText: x.searchText,
      extractionSource: x.extractionSource,
      needsReview: x.needsReview,
      reviewReasons: x.reviewReasons,
      badgeFormat: x.badgeFormat,
      status: "PRINTED",
      printCount: 1,
      firstPrintedAt: now,
      lastPrintedAt: now,
      lastPrintedBy: input.operator,
      uploadedBy: input.operator,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await logEvents([
    {
      type: "RECONCILED_PRINTED",
      actor: input.operator,
      cardId: card.id,
      payload: { fullName: card.fullName, source: "camera-reconciliation-new" },
    },
  ]);
  return toCardSummary(card);
}
