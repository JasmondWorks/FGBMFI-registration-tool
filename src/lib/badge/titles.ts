import { tokenize } from "./normalize";

/**
 * Honorifics that can appear before a name on a badge. People often carry several
 * ("ELDER AMB. MR JOHN DOE"). Compared after normalisation, so dots and case don't matter.
 * This list is a FALLBACK: when the filename gives us the bare name, everything before
 * that name on the badge is treated as titles, even words not listed here.
 */
export const PREFIX_TITLES = [
  "mr", "mrs", "ms", "miss", "master", "mdm", "madam",
  "dr", "prof", "professor",
  "rev", "revd", "reverend", "pastor", "pst", "apostle", "apst", "bishop", "archbishop",
  "evang", "evangelist", "prophet", "prophetess", "deacon", "deaconess", "dcn", "dcns",
  "elder", "eld", "bro", "brother", "sis", "sister",
  "amb", "ambassador", "engr", "eng", "arc", "barr", "barrister", "pharm", "surv", "tpl", "qs",
  "chief", "chf", "hon", "honourable", "honorable", "sir", "lady", "dame",
  "hrh", "hrm", "oba", "eze", "igwe", "obi",
  "col", "gen", "maj", "capt", "lt", "cdr", "cmdr", "adm", "brig", "sgt", "cpl", "avm",
  "senator", "sen", "comrade", "comr", "otunba", "alhaji", "alhaja",
] as const;

/** Multi-word honorifics, matched before single words. */
export const PHRASE_TITLES = [
  ["his", "royal", "highness"],
  ["her", "royal", "highness"],
  ["his", "excellency"],
  ["her", "excellency"],
  ["h", "e"],
  ["very", "rev"],
  ["rt", "rev"],
  ["most", "rev"],
] as const;

/** Letters that can follow a name ("JOHN DOE KSM", "JANE DOE (RTD)"). */
export const POST_NOMINALS = [
  "ksm", "kss", "ksj", "jp", "mni", "oon", "ofr", "con", "mfr", "mon", "phd", "fca", "fcca", "aca",
  "esq", "rtd", "snr", "jnr", "sr", "jr",
] as const;

const PREFIX_SET = new Set<string>(PREFIX_TITLES);
const POST_SET = new Set<string>(POST_NOMINALS);

export type TitleSplit = {
  titles: string[]; // as written on the badge, e.g. ["ELDER", "AMB.", "MR"]
  name: string; // as written on the badge, e.g. "JOHN DOE"
  postNominals: string[];
  method: "filename-anchor" | "title-list" | "none";
};

type RawToken = { raw: string; norm: string };

function rawTokens(line: string): RawToken[] {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, norm: tokenize(raw).join("") }))
    .filter((t) => t.norm.length > 0 || /[()]/.test(t.raw));
}

function cleanRaw(raw: string) {
  return raw.replace(/^[(,]+|[),]+$/g, "");
}

/**
 * Split "ELDER AMB. MR JOHN DOE KSM" into titles, name and post-nominals.
 * `filenameName` (from the platform's filename) anchors the split when available.
 */
export function splitTitles(line: string, filenameName?: string | null): TitleSplit {
  const tokens = rawTokens(line.trim());
  if (tokens.length === 0) return { titles: [], name: "", postNominals: [], method: "none" };

  // 1) Anchor on the filename name: find its tokens as a contiguous run on the badge line.
  const anchor = stripTitlesFromTokens(tokenize(filenameName ?? "")).name;
  if (anchor.length > 0) {
    const norms = tokens.map((t) => t.norm);
    for (let start = 0; start + anchor.length <= norms.length; start++) {
      const window = norms.slice(start, start + anchor.length);
      if (sameMultiset(window, anchor)) {
        const before = tokens.slice(0, start);
        const after = tokens.slice(start + anchor.length);
        return {
          titles: before.map((t) => cleanRaw(t.raw)).filter(Boolean),
          name: tokens.slice(start, start + anchor.length).map((t) => cleanRaw(t.raw)).join(" "),
          postNominals: after.map((t) => cleanRaw(t.raw)).filter(Boolean),
          method: "filename-anchor",
        };
      }
    }
  }

  // 2) Fall back to the known title lists.
  const { titleCount, postCount } = countTitles(tokens.map((t) => t.norm));
  const titles = tokens.slice(0, titleCount);
  const nameTokens = tokens.slice(titleCount, tokens.length - postCount);
  const post = tokens.slice(tokens.length - postCount);
  return {
    titles: titles.map((t) => cleanRaw(t.raw)).filter(Boolean),
    name: nameTokens.map((t) => cleanRaw(t.raw)).join(" "),
    postNominals: post.map((t) => cleanRaw(t.raw)).filter(Boolean),
    method: titleCount > 0 || postCount > 0 ? "title-list" : "none",
  };
}

/** Strip titles from already-normalised tokens (used for filename names). */
export function stripTitlesFromTokens(tokens: string[]): { titles: string[]; name: string[] } {
  const { titleCount, postCount } = countTitles(tokens);
  return {
    titles: tokens.slice(0, titleCount),
    name: tokens.slice(titleCount, tokens.length - postCount),
  };
}

function countTitles(norms: string[]): { titleCount: number; postCount: number } {
  let i = 0;
  // Always leave at least one token for the name.
  outer: while (i < norms.length - 1) {
    for (const phrase of PHRASE_TITLES) {
      if (i + phrase.length < norms.length && phrase.every((p, k) => norms[i + k] === p)) {
        i += phrase.length;
        continue outer;
      }
    }
    if (PREFIX_SET.has(norms[i])) {
      i++;
      continue;
    }
    break;
  }
  let j = 0;
  while (norms.length - j - 1 > i && POST_SET.has(norms[norms.length - 1 - j])) j++;
  return { titleCount: i, postCount: j };
}

function sameMultiset(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, k) => v === y[k]);
}

/** "MRS", ["ELDER","AMB.","MR"] -> "Elder Amb. Mr" for display */
export function formatTitles(titles: string[]): string {
  return titles.map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()).join(" ");
}
