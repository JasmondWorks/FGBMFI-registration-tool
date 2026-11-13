import "server-only";

import { eq } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";

import { db } from "./db";
import { cards } from "./db/schema";

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
