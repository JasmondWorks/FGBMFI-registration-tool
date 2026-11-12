import { normalizeText, namesMatch } from "./normalize";
import { splitTitles, type TitleSplit } from "./titles";

/**
 * Turns the text found on a badge into structured fields.
 * Pure function: the PDF reading happens elsewhere and hands us positioned lines.
 *
 * Observed layout of the FGBMFI badge (A6):
 *   MRS IBEKWE ETHEL            <- biggest text, the name line (with titles)
 *   District: South East 1
 *   Chapter: Umidim Nnewi
 *   ID: CON26111118222902ffc391d2
 *   [QR code]
 * Any other "Label: value" line is captured too, so new fields show up without code changes.
 */

export type BadgeLine = { text: string; fontSize: number; y: number };

export type ParsedBadgeText = {
  nameLine: string | null;
  split: TitleSplit;
  district: string | null;
  chapter: string | null;
  registrationId: string | null;
  extraFields: Record<string, string>;
  warnings: string[];
};

const KNOWN_LABELS: Record<string, "district" | "chapter" | "registrationId"> = {
  district: "district",
  chapter: "chapter",
  id: "registrationId",
  "reg id": "registrationId",
  "registration id": "registrationId",
  "delegate id": "registrationId",
};

const LABEL_LINE = /^([A-Za-z][A-Za-z .\/&-]{0,30}?)\s*:\s*(.+)$/;

export function parseBadgeLines(lines: BadgeLine[], filenameName?: string | null): ParsedBadgeText {
  const warnings: string[] = [];
  const extraFields: Record<string, string> = {};
  let district: string | null = null;
  let chapter: string | null = null;
  let registrationId: string | null = null;
  const unlabeled: BadgeLine[] = [];

  for (const line of lines) {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const m = text.match(LABEL_LINE);
    if (m) {
      const label = normalizeText(m[1]);
      const value = m[2].trim();
      const known = KNOWN_LABELS[label];
      if (known === "district") district = value;
      else if (known === "chapter") chapter = value;
      else if (known === "registrationId") registrationId = value.replace(/\s+/g, "");
      else extraFields[toFieldKey(m[1])] = value;
      continue;
    }
    unlabeled.push({ ...line, text });
  }

  // The name is the largest unlabeled text. Ties go to the one that matches the filename, then the topmost.
  let nameLine: string | null = null;
  if (unlabeled.length > 0) {
    const sorted = [...unlabeled].sort((a, b) => {
      if (Math.abs(b.fontSize - a.fontSize) > 0.5) return b.fontSize - a.fontSize;
      const am = filenameName && namesMatch(a.text, filenameName) ? 1 : 0;
      const bm = filenameName && namesMatch(b.text, filenameName) ? 1 : 0;
      if (am !== bm) return bm - am;
      return b.y - a.y;
    });
    nameLine = sorted[0].text;
  }

  if (!nameLine) warnings.push("No name found on the badge");
  if (!district) warnings.push("No district on the badge");
  if (!chapter) warnings.push("No chapter on the badge");
  if (!registrationId) warnings.push("No registration ID on the badge");

  const split = splitTitles(nameLine ?? "", filenameName);
  return { nameLine, split, district, chapter, registrationId, extraFields, warnings };
}

function toFieldKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ""));
}
