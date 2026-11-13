import "server-only";

import { eq, lt } from "drizzle-orm";

import { db } from "./db";
import { stagingFiles } from "./db/schema";

/**
 * Staged files (uploaded, read, but not yet accepted into a card) live in Postgres,
 * not local disk: the duplicate-review step in between can take a while and is a
 * separate request from the one that analyzed the file, so it has to survive across
 * requests landing on different server instances. Accepted badge files go straight to
 * Cloudinary (see cloudinary.ts) for the same reason — nothing about serving a badge
 * can depend on the request that uploaded it still being the one answering later.
 */
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

export async function saveStaging<M extends object>(bytes: Uint8Array, mime: string, meta: M) {
  const ext = extensionFor(mime);
  const [row] = await db
    .insert(stagingFiles)
    .values({ bytes: Buffer.from(bytes), mime, ext, meta: { ...meta, ext, mime } })
    .returning({ id: stagingFiles.id });
  void cleanupStaging();
  return row.id;
}

export async function readStagingMeta<M>(id: string): Promise<(M & { ext: string; mime: string }) | null> {
  const row = await db.query.stagingFiles.findFirst({ where: eq(stagingFiles.id, id), columns: { meta: true } });
  return (row?.meta as (M & { ext: string; mime: string }) | undefined) ?? null;
}

export async function readStagingFile(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const row = await db.query.stagingFiles.findFirst({ where: eq(stagingFiles.id, id), columns: { bytes: true, mime: true } });
  return row ? { bytes: row.bytes, mime: row.mime } : null;
}

export async function discardStaging(id: string) {
  await db.delete(stagingFiles).where(eq(stagingFiles.id, id));
}

/** Fetches bytes from wherever the card's badge actually lives (Cloudinary, the only durable copy). */
export async function fetchCardBytes(cloudinaryUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(cloudinaryUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

let lastCleanup = 0;
async function cleanupStaging() {
  const now = Date.now();
  if (now - lastCleanup < 60 * 60 * 1000) return;
  lastCleanup = now;
  try {
    await db.delete(stagingFiles).where(lt(stagingFiles.createdAt, new Date(now - STAGING_TTL_MS)));
  } catch {
    // best effort
  }
}
