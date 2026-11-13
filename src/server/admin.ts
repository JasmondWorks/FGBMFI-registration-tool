import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./db";
import { deleteAllCardFiles } from "./cloudinary";
import { auditEvents, cards, jobs, pageItems, pages, stagingFiles } from "./db/schema";

/**
 * Wipes every badge, page, job and audit event, every staged (not-yet-accepted) file, and
 * every badge file in Cloudinary. For clearing out test data before going live — never
 * for use once the desk is tracking real badges.
 */
export async function resetAllData() {
  await deleteAllCardFiles();
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table ${auditEvents}, ${pageItems}, ${pages}, ${cards}, ${jobs}, ${stagingFiles} restart identity cascade`);
  });
}
