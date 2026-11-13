import { nameKey } from "@/lib/badge/normalize";
import type { FlaggedFile, IntakeFile } from "./types";

/**
 * Combines duplicates found in the system (from the server) with duplicates inside this
 * upload. Within the upload, the first copy is kept as the reference and later copies are flagged.
 */
export function collectFlags(files: IntakeFile[]): FlaggedFile[] {
  const ready = files.filter((f) => f.status === "ready" && f.analysis);
  const seenHash = new Map<string, string>();
  const seenReg = new Map<string, string>();
  const seenName = new Map<string, string>();
  const flagged: FlaggedFile[] = [];

  for (const f of ready) {
    const a = f.analysis!;
    const flags: FlaggedFile["flags"] = a.duplicates.map((match) => ({ kind: "system" as const, match }));

    const hashFirst = seenHash.get(a.fileHash);
    const regFirst = a.registrationId ? seenReg.get(a.registrationId) : undefined;
    const key = nameKey(a.fullName);
    const nameFirst = key ? seenName.get(key) : undefined;
    if (hashFirst) flags.push({ kind: "upload", otherKey: hashFirst, label: "Same file appears twice in this upload", strength: 3 });
    else if (regFirst) flags.push({ kind: "upload", otherKey: regFirst, label: "Same registration ID twice in this upload", strength: 3 });
    else if (nameFirst) flags.push({ kind: "upload", otherKey: nameFirst, label: "Same name twice in this upload", strength: 2 });

    if (!seenHash.has(a.fileHash)) seenHash.set(a.fileHash, f.key);
    if (a.registrationId && !seenReg.has(a.registrationId)) seenReg.set(a.registrationId, f.key);
    if (key && !seenName.has(key)) seenName.set(key, f.key);

    if (flags.length) {
      flags.sort((x, y) => strengthOf(y) - strengthOf(x));
      flagged.push({ file: f, flags });
    }
  }
  return flagged;
}

export function strengthOf(flag: FlaggedFile["flags"][number]) {
  return flag.kind === "system" ? flag.match.strength : flag.strength;
}

export type FlagFilter = "all" | "exact" | "person" | "name" | "similar" | "upload" | "printed";

export function matchesFilter(f: FlaggedFile, filter: FlagFilter) {
  if (filter === "all") return true;
  return f.flags.some((flag) => {
    if (filter === "upload") return flag.kind === "upload";
    if (flag.kind !== "system") return false;
    const t = flag.match.type;
    if (filter === "exact") return t === "EXACT_FILE";
    if (filter === "person") return t === "SAME_REG_ID" || t === "NEWER_VERSION" || t === "OLDER_VERSION";
    if (filter === "name") return t === "SAME_NAME";
    if (filter === "similar") return t === "SIMILAR_NAME";
    if (filter === "printed") return flag.match.existing.printCount > 0;
    return false;
  });
}
