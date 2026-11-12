import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";

import { db } from "./db";
import { auditEvents, cards, jobs, pageItems, pages } from "./db/schema";

/**
 * Wipes every badge, page, job and audit event, and deletes the local badge/staging
 * files. For clearing out test data before going live — never for use once the desk
 * is tracking real badges.
 */
export async function resetAllData() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table ${auditEvents}, ${pageItems}, ${pages}, ${cards}, ${jobs} restart identity cascade`);
  });

  const root = path.resolve(process.env.STORAGE_DIR || "./storage");
  for (const dir of ["staging", "badges"]) {
    await fs.rm(path.join(root, dir), { recursive: true, force: true });
  }
}
