import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Local file storage on the desk laptop. Printing always reads from here, so the
 * desk keeps working if the venue internet drops. Cloudinary is a backup copy.
 *
 *   storage/staging/<id>.<ext> + <id>.json   files analysed but not yet accepted
 *   storage/badges/<yyyy-mm-dd>/<cardId>.<ext>  accepted badge files
 */
const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");
const STAGING = path.join(ROOT, "staging");
const BADGES = path.join(ROOT, "badges");
const STAGING_TTL_MS = 24 * 60 * 60 * 1000;

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const ALLOWED_MIME_TYPES = Object.keys(EXT_BY_MIME);
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function extensionFor(mime: string) {
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`Unsupported file type: ${mime}`);
  return ext;
}

function isSafeId(id: string) {
  return /^[a-f0-9-]{36}$/i.test(id);
}

export async function saveStaging<M extends object>(bytes: Uint8Array, mime: string, meta: M) {
  await fs.mkdir(STAGING, { recursive: true });
  const id = randomUUID();
  const ext = extensionFor(mime);
  await fs.writeFile(path.join(STAGING, `${id}.${ext}`), bytes);
  await fs.writeFile(path.join(STAGING, `${id}.json`), JSON.stringify({ ...meta, ext, mime }));
  void cleanupStaging();
  return id;
}

export async function readStagingMeta<M>(id: string): Promise<(M & { ext: string; mime: string }) | null> {
  if (!isSafeId(id)) return null;
  try {
    const raw = await fs.readFile(path.join(STAGING, `${id}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readStagingFile(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const meta = await readStagingMeta<object>(id);
  if (!meta) return null;
  try {
    const bytes = await fs.readFile(path.join(STAGING, `${id}.${meta.ext}`));
    return { bytes, mime: meta.mime };
  } catch {
    return null;
  }
}

/** Moves a staged file into permanent storage and returns its path relative to the storage root. */
export async function promoteStaging(stagingId: string, cardId: string, ext: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(BADGES, day);
  await fs.mkdir(dir, { recursive: true });
  const rel = path.join("badges", day, `${cardId}.${ext}`);
  await fs.rename(path.join(STAGING, `${stagingId}.${ext}`), path.join(ROOT, rel));
  await fs.rm(path.join(STAGING, `${stagingId}.json`), { force: true });
  return rel;
}

export async function discardStaging(id: string) {
  const meta = await readStagingMeta<object>(id);
  if (!meta) return;
  await fs.rm(path.join(STAGING, `${id}.${meta.ext}`), { force: true });
  await fs.rm(path.join(STAGING, `${id}.json`), { force: true });
}

export async function readStoredFile(relPath: string): Promise<Buffer | null> {
  const full = path.resolve(ROOT, relPath);
  if (!full.startsWith(ROOT + path.sep)) return null; // never escape the storage root
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export function absoluteStoredPath(relPath: string) {
  return path.resolve(ROOT, relPath);
}

let lastCleanup = 0;
async function cleanupStaging() {
  const now = Date.now();
  if (now - lastCleanup < 60 * 60 * 1000) return;
  lastCleanup = now;
  try {
    for (const name of await fs.readdir(STAGING)) {
      const p = path.join(STAGING, name);
      const stat = await fs.stat(p);
      if (now - stat.mtimeMs > STAGING_TTL_MS) await fs.rm(p, { force: true });
    }
  } catch {
    // best effort
  }
}
