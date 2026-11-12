import "server-only";

import { eq } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";

import { logEvent } from "./audit";
import { db } from "./db";
import { cards } from "./db/schema";
import { readStoredFile } from "./storage";

/**
 * Cloudinary keeps an off-site copy of every badge. It never blocks the desk:
 * uploads run in the background after a file is accepted, retry with backoff,
 * and a failed sync is shown in the UI with a retry button.
 */

export function isCloudEnabled() {
  return Boolean(process.env.CLOUDINARY_URL);
}

let configured = false;
function configure() {
  if (configured) return;
  // The SDK reads CLOUDINARY_URL from the environment.
  cloudinary.config({ secure: true });
  configured = true;
}

const MAX_CONCURRENT = 4;
const MAX_TRIES = 3;
let running = 0;
const queue: string[] = [];
const queued = new Set<string>();

/** Queue cards for upload. Safe to call many times for the same card. */
export function queueCloudSync(cardIds: string[]) {
  if (!isCloudEnabled()) return;
  for (const id of cardIds) {
    if (queued.has(id)) continue;
    queued.add(id);
    queue.push(id);
  }
  pump();
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()!;
    running++;
    syncCard(id)
      .catch(() => undefined)
      .finally(() => {
        running--;
        queued.delete(id);
        pump();
      });
  }
}

async function syncCard(cardId: string) {
  configure();
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (!card || card.cloudStatus === "SYNCED") return;
  const bytes = await readStoredFile(card.localPath);
  if (!bytes) {
    await db.update(cards).set({ cloudStatus: "FAILED", cloudError: "Local file missing" }).where(eq(cards.id, cardId));
    return;
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const day = card.createdAt.toISOString().slice(0, 10);
      const result = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `namecard-desk/${day}`,
            public_id: card.id,
            resource_type: "image", // PDFs are "image" resources, which allows page previews
            overwrite: false,
            context: { full_name: card.fullName, registration_id: card.registrationId ?? "" },
          },
          (err, res) => (err || !res ? reject(err ?? new Error("No response")) : resolve(res)),
        );
        stream.end(bytes);
      });
      await db
        .update(cards)
        .set({ cloudStatus: "SYNCED", cloudinaryPublicId: result.public_id, cloudinaryUrl: result.secure_url, cloudError: null })
        .where(eq(cards.id, cardId));
      await logEvent({ type: "CLOUD_SYNCED", actor: "system", cardId, payload: { publicId: result.public_id } });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  await db.update(cards).set({ cloudStatus: "FAILED", cloudError: lastError.slice(0, 500) }).where(eq(cards.id, cardId));
  await logEvent({ type: "CLOUD_FAILED", actor: "system", cardId, payload: { error: lastError.slice(0, 500) } });
}
