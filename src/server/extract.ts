import "server-only";

import { createHash } from "node:crypto";

import { parseBadgeFilename } from "@/lib/badge/filename";
import { canonicalLabel, canonicalName, canonicalTitle, nameKey, namesMatch, normalizeText } from "@/lib/badge/normalize";
import { parseBadgeLines, type BadgeLine } from "@/lib/badge/parse-text";
import { splitTitles, stripTitlesFromTokens } from "@/lib/badge/titles";
import { tokenize } from "@/lib/badge/normalize";

/** Everything we can learn from one badge file, before it is saved. */
export type Extraction = {
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
  badgeGeneratedAt: Date | null;
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

const A6 = { w: 297.64, h: 419.53 };

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

type PdfText = { lines: BadgeLine[]; rawText: string; width: number; height: number; hasEmbeddedImage: boolean };

/**
 * Some registration platforms export the whole card (pre-printed artwork baked into the
 * PDF) instead of a transparent name-only overlay. We can't tell these apart by text
 * content alone, but the overlay format is pure vector text with no raster images, so any
 * embedded image on the page is a strong signal this is the other format. We don't yet
 * know the crop geometry for it (no sample on hand), so this only flags it for review
 * rather than guessing where the dynamic region is.
 */
async function hasEmbeddedImage(page: { getOperatorList(): Promise<{ fnArray: number[] }> }) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const ops = await page.getOperatorList();
  const imageOps = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageXObjectRepeat]);
  return ops.fnArray.some((fn) => imageOps.has(fn));
}

async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), // pdfjs takes ownership of the buffer
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const hasImage = await hasEmbeddedImage(page);

    // Group text runs into lines by their baseline. The badge draws the name three
    // times with tiny x offsets (faux bold), so identical runs on a line are de-duplicated.
    const rows = new Map<number, { parts: { x: number; s: string }[]; size: number }>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const [, , , d, x, y] = item.transform as number[];
      const key = Math.round(y);
      const row = rows.get(key) ?? { parts: [], size: 0 };
      row.parts.push({ x, s: item.str });
      row.size = Math.max(row.size, Math.abs(d));
      rows.set(key, row);
    }

    const lines: BadgeLine[] = [];
    for (const [y, row] of rows) {
      const sorted = row.parts.sort((a, b) => a.x - b.x);
      const pieces: string[] = [];
      for (const p of sorted) {
        if (pieces.length > 0 && pieces[pieces.length - 1] === p.s) continue; // faux-bold duplicate
        pieces.push(p.s);
      }
      const text = pieces.join("").replace(/\s+/g, " ").trim();
      if (text) lines.push({ text, fontSize: row.size, y });
    }
    lines.sort((a, b) => b.y - a.y);
    return {
      lines,
      rawText: lines.map((l) => l.text).join("\n"),
      width: viewport.width,
      height: viewport.height,
      hasEmbeddedImage: hasImage,
    };
  } finally {
    await task.destroy();
  }
}

export async function extractBadge(bytes: Uint8Array, mime: string, filename: string): Promise<Extraction> {
  const fileHash = sha256(bytes);
  const reasons: string[] = [];
  const parsedName = parseBadgeFilename(filename);
  const filenameName = parsedName.ok ? canonicalName(parsedName.nameFromFile) : null;
  if (!parsedName.ok) reasons.push(parsedName.reason);
  if (parsedName.ok && parsedName.size !== "A6") {
    reasons.push(`Badge size is ${parsedName.size}. The sheet layout expects A6 (4 per A4).`);
  }

  let text: PdfText | null = null;
  let badgeFormat: "OVERLAY" | "FULL_CARD" = "OVERLAY";
  if (mime === "application/pdf") {
    try {
      text = await readPdfText(bytes);
    } catch (err) {
      reasons.push(`Could not read the PDF (${err instanceof Error ? err.message : "unknown error"})`);
    }
    if (text && (Math.abs(text.width - A6.w) > 3 || Math.abs(text.height - A6.h) > 3)) {
      reasons.push(
        `Page is ${Math.round((text.width / 72) * 25.4)} x ${Math.round((text.height / 72) * 25.4)} mm, not A6 (105 x 148 mm). It will be scaled to fit.`,
      );
    }
    if (text?.hasEmbeddedImage) {
      badgeFormat = "FULL_CARD";
      reasons.push(
        "This file has a background image baked in, not just a name overlay. It will print the card artwork again on top of the pre-printed stock until someone calibrates the crop region for this format — check it before printing.",
      );
    }
  } else {
    reasons.push("Image file: details come from the filename only. Check them before printing.");
  }

  const hasText = !!text && text.lines.length > 0;
  if (mime === "application/pdf" && text && !hasText) {
    reasons.push("The PDF has no readable text (it may be a scan). Details come from the filename only.");
  }

  const parsed = hasText ? parseBadgeLines(text!.lines, filenameName) : null;

  let titles: string[] = [];
  let postNominals: string[] = [];
  let fullName = "";
  if (parsed && parsed.split.name) {
    titles = parsed.split.titles;
    postNominals = parsed.split.postNominals;
    fullName = parsed.split.name;
    for (const w of parsed.warnings) if (w !== "No name found on the badge") reasons.push(w);
  } else if (filenameName) {
    const split = splitTitles(filenameName, null);
    titles = split.titles;
    fullName = split.name;
    if (parsed) reasons.push("No name found on the badge text. Using the filename.");
  } else {
    fullName = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
    reasons.push("No name found. Using the filename as-is.");
  }

  // Cross-check the badge against the filename (filename is weak, badge is strong).
  if (parsed?.split.name && filenameName) {
    const fileTokens = stripTitlesFromTokens(tokenize(filenameName)).name.join(" ");
    if (!namesMatch(parsed.split.name, fileTokens)) {
      reasons.push(`Name on badge ("${parsed.split.name}") doesn't match the filename ("${filenameName}").`);
    }
  }

  // Normalise strongly before anything is stored.
  fullName = canonicalName(fullName) || canonicalName(filenameName) || "Unknown";
  titles = titles.map(canonicalTitle).filter(Boolean);
  postNominals = postNominals.map(canonicalTitle).filter(Boolean);
  const district = canonicalLabel(parsed?.district);
  const chapter = canonicalLabel(parsed?.chapter);
  const registrationId = parsed?.registrationId ? parsed.registrationId.replace(/\s+/g, "") : null; // IDs keep their case, exactly as issued
  const extraFields = Object.fromEntries(
    Object.entries(parsed?.extraFields ?? {}).map(([k, v]) => [k, canonicalLabel(v) ?? ""]),
  );
  const rawText = text?.rawText ?? "";

  const searchText = normalizeText(
    [
      titles.join(" "),
      fullName,
      postNominals.join(" "),
      district,
      chapter,
      registrationId,
      filename,
      Object.values(extraFields).join(" "),
      rawText,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    fileHash,
    titles,
    postNominals,
    fullName,
    nameKey: nameKey(fullName),
    district,
    chapter,
    registrationId,
    extraFields,
    badgeSize: parsedName.ok ? parsedName.size : null,
    badgeGeneratedAt: parsedName.ok ? parsedName.generatedAt : null,
    filenameName,
    rawText,
    searchText,
    extractionSource: hasText ? "TEXT_LAYER" : "FILENAME_ONLY",
    pageWidthPt: text ? Math.round(text.width) : null,
    pageHeightPt: text ? Math.round(text.height) : null,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    badgeFormat,
  };
}
