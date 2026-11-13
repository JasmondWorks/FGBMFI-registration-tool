/**
 * Text normalisation used for matching and searching.
 * Everything that compares names goes through these functions so the rules live in one place.
 */

/** Lowercase, strip accents, turn punctuation into spaces, collapse whitespace. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * The single stored form of a person's name. Applied to every name before it is saved,
 * whatever its source (badge text, filename, or a manual edit):
 *   "IBEKWE_ETHEL" / "ibekwe   ethel" / " Ibekwe-Ethel_" -> "Ibekwe Ethel" / "Ibekwe-Ethel"
 * Underscores and repeated spaces collapse, stray symbols go, hyphens and apostrophes stay,
 * and each name part is capitalised (Ade-Bello, O'Brien).
 */
export function canonicalName(value: string | null | undefined): string {
  if (!value) return "";
  const cleaned = value
    .normalize("NFC")
    .replace(/[_\s]+/g, " ")
    .replace(/[‘’`]/g, "'")
    .replace(/[^\p{L}\p{M}' -]+/gu, " ") // keep letters, apostrophes, hyphens, spaces
    .replace(/\s*-\s*/g, "-")
    .replace(/'{2,}/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-']+|[-']+$/g, "");
  return cleaned
    .toLocaleLowerCase("en")
    .replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("en"));
}

/** Titles are stored without dots or brackets, capitalised: "AMB." -> "Amb", "(MRS)" -> "Mrs". */
export function canonicalTitle(value: string): string {
  const t = value.replace(/[^\p{L}\p{N}]+/gu, "");
  if (!t) return "";
  return t.charAt(0).toLocaleUpperCase("en") + t.slice(1).toLocaleLowerCase("en");
}

/** District, chapter and similar labels: trimmed, single-spaced, underscores removed, case kept. */
export function canonicalLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.normalize("NFC").replace(/[_\s]+/g, " ").trim();
  return v || null;
}

export function tokenize(value: string | null | undefined): string[] {
  const n = normalizeText(value);
  return n ? n.split(" ") : [];
}

/**
 * Order-insensitive key for a person's name, so "Ibekwe Ethel" and "Ethel Ibekwe" match.
 * Titles must already be removed.
 */
export function nameKey(name: string | null | undefined): string {
  return tokenize(name).sort().join(" ");
}

/**
 * True when two names refer to the same person, tolerating word order and
 * a missing middle name (one name's tokens are a subset of the other's).
 */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size < 2 && large.size >= 2) {
    // A single token is too weak to claim a match against a full name.
    return false;
  }
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[n];
}

/**
 * True when two already-normalized name keys are close enough to plausibly be the same
 * name with a typo (not an exact match — that's nameKey equality, handled separately),
 * e.g. a registration re-done to fix a misspelling. Deliberately loose: a few edits
 * allowed relative to length, which will also catch some genuinely different short names
 * — that's why this is surfaced for a human to judge, never auto-applied.
 */
export function nameKeysLookSimilar(ka: string, kb: string): boolean {
  if (!ka || !kb || ka === kb) return false;
  if (ka.length < 6 || kb.length < 6) return false; // too short for edit-distance to mean much
  const distance = levenshtein(ka, kb);
  const maxLen = Math.max(ka.length, kb.length);
  return distance <= 2 && distance / maxLen < 0.25;
}
