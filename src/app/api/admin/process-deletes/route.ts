import { handle, ok } from "@/server/http";
import { processDeleteQueue } from "@/server/cloudinary";

/**
 * Safety-net drain for the Cloudinary delete queue — every delete already triggers the
 * worker right after responding, but this exists for whatever that didn't get to (a
 * cron, or just hitting this by hand) rather than leaving stuck rows to pile up silently.
 */
export const POST = handle(async () => ok(await processDeleteQueue()));
