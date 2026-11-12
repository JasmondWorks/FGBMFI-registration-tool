/**
 * Parses filenames produced by the FGBMFI registration platform, e.g.
 *   FGBMFI_Badge_A6_Anthony_Madugba_2026-11-12_120119.pdf
 *   FGBMFI_Badge_A6_IBEKWE_ETHEL_2026-11-12_121659 (1).pdf   (browser re-download)
 *
 * The filename is the WEAK identity signal (it can be renamed). The PDF content is the strong one.
 */

/** The platform stamps times in Nigerian time (WAT, UTC+1). */
export const BADGE_TIMEZONE_OFFSET = "+01:00";

export type ParsedFilename =
  | {
      ok: true;
      org: string;
      docType: string;
      size: string;
      nameFromFile: string;
      generatedAt: Date;
    }
  | { ok: false; reason: string };

const PATTERN =
  /([A-Za-z0-9]+)_(Badge)_(A\d)_(.+?)_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:\s*\(\d+\))?\.(pdf|png|jpe?g)$/i;

export function parseBadgeFilename(filename: string): ParsedFilename {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const m = base.match(PATTERN);
  if (!m) {
    return {
      ok: false,
      reason: "Filename doesn't follow the platform format (ORG_Badge_SIZE_Name_YYYY-MM-DD_HHMMSS.pdf)",
    };
  }
  const [, org, docType, size, rawName, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${BADGE_TIMEZONE_OFFSET}`;
  const generatedAt = new Date(iso);
  if (Number.isNaN(generatedAt.getTime())) {
    return { ok: false, reason: `Invalid date or time in filename (${y}-${mo}-${d} ${h}:${mi}:${s})` };
  }
  const nameFromFile = rawName.replace(/_+/g, " ").trim().replace(/\s+/g, " ");
  if (!nameFromFile) return { ok: false, reason: "No name found in the filename" };

  return { ok: true, org: org.toUpperCase(), docType, size: size.toUpperCase(), nameFromFile, generatedAt };
}
