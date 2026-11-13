import "server-only";

import { eq, lt, sql } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";
import { after } from "next/server";

import { db } from "./db";
import { cards, cloudDeleteQueue } from "./db/schema";

/**
 * Cloudinary is the durable copy of every badge file — not a backup. Local disk is only
 * ever a same-request convenience (nothing later can rely on it surviving), so a badge
 * isn't considered saved until this succeeds. Called synchronously during commit, not
 * queued in the background, so a failure surfaces to the operator immediately instead of
 * quietly leaving a card with nowhere its file actually lives.
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

const MAX_TRIES = 3;

/** Uploads one badge file's bytes to Cloudinary. Throws if it never succeeds. */
export async function uploadCardFile(
  cardId: string,
  bytes: Uint8Array,
  createdAt: Date,
  context: { fullName: string; registrationId: string | null },
): Promise<{ publicId: string; url: string }> {
  if (!isCloudEnabled()) throw new Error("Cloud storage isn't configured (CLOUDINARY_URL is missing)");
  configure();
  const day = createdAt.toISOString().slice(0, 10);

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const result = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `namecard-desk/${day}`,
            public_id: cardId,
            resource_type: "image", // PDFs are "image" resources, which allows page previews
            overwrite: false,
            context: { full_name: context.fullName, registration_id: context.registrationId ?? "" },
          },
          (err, res) => (err || !res ? reject(err ?? new Error("No response")) : resolve(res)),
        );
        stream.end(bytes);
      });
      return { publicId: result.public_id, url: result.secure_url };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error(lastError || "Cloud upload failed");
}

/**
 * A card can only be FAILED/PENDING now if it predates this migration (new uploads never
 * leave commit without a working cloud copy — see intake.ts). There's no bytes left to
 * retry with for those, so this just reports how many are stuck rather than pretending
 * to fix them.
 */
export async function retryCloudSync() {
  const rows = await db.query.cards.findMany({ where: eq(cards.cloudStatus, "FAILED"), columns: { id: true } });
  return rows.length;
}

const DELETE_MAX_ATTEMPTS = 8;
const DELETE_BATCH_SIZE = 20;

/**
 * Queues one badge's file for deletion instead of calling Cloudinary inline — a delete
 * shouldn't make the operator wait on a third-party network call, or fail the card removal
 * itself if Cloudinary happens to be slow or briefly unreachable. A worker drains this
 * (see processDeleteQueue); call triggerDeleteQueue right after to run it promptly without
 * blocking the response.
 */
export async function enqueueDelete(publicId: string) {
  await db.insert(cloudDeleteQueue).values({ publicId });
}

/**
 * Drains the delete queue: destroys each file on Cloudinary and removes its row on
 * success, or records the failure and leaves it for the next tick (up to a point — past
 * DELETE_MAX_ATTEMPTS, it's left in place rather than retried forever, so a permanently
 * bad public_id doesn't spin silently; it stays visible in the table for someone to look
 * at). Safe to run concurrently/repeatedly — destroy on an already-gone public_id just
 * reports "not found", which is treated as success.
 */
export async function processDeleteQueue() {
  if (!isCloudEnabled()) return { processed: 0 };
  configure();
  const rows = await db.query.cloudDeleteQueue.findMany({
    where: lt(cloudDeleteQueue.attempts, DELETE_MAX_ATTEMPTS),
    limit: DELETE_BATCH_SIZE,
  });
  let processed = 0;
  for (const row of rows) {
    try {
      await cloudinary.uploader.destroy(row.publicId, { resource_type: "image" });
      await db.delete(cloudDeleteQueue).where(eq(cloudDeleteQueue.id, row.id));
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(cloudDeleteQueue)
        .set({ attempts: sql`${cloudDeleteQueue.attempts} + 1`, lastError: message.slice(0, 500) })
        .where(eq(cloudDeleteQueue.id, row.id));
    }
  }
  return { processed };
}

/**
 * Runs the queue worker after the response is sent, not as a bare fire-and-forget promise
 * — on Vercel a serverless function can be frozen the instant it responds, so an
 * un-awaited promise can simply never finish. `after()` is the supported way to keep the
 * function alive long enough to actually do this work. The DB queue is still the real
 * safety net (a cron hitting /api/admin/process-deletes, or the next delete, picks up
 * anything this didn't get to) — this just makes the common case feel instant.
 */
export function triggerDeleteQueue() {
  after(() => processDeleteQueue().catch(() => undefined));
}

/** Wipes every badge file this desk has ever uploaded — used only by the full data reset. */
export async function deleteAllCardFiles() {
  if (!isCloudEnabled()) return;
  configure();
  // Caps at 1000 assets per call; `partial` means more are left under the prefix, so
  // calling again picks up the next batch until nothing's left.
  let partial = true;
  while (partial) {
    const result = await cloudinary.api.delete_resources_by_prefix("namecard-desk/", { resource_type: "image" });
    partial = Boolean(result.partial);
  }
}
