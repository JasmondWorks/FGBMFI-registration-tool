import { z } from "zod";

import { resetAllData } from "@/server/admin";
import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";
import { isUnlocked } from "@/server/settings-auth";

const schema = z.object({ confirm: z.literal("DELETE EVERYTHING") });

/**
 * Wipes all badges, pages, jobs and audit history. Requires the whole Settings page to be
 * PIN-unlocked (see settings-auth.ts) AND the exact confirmation phrase — the phrase alone
 * is too easy to type without meaning to; the PIN is what has to be deliberately known.
 */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  if (!(await isUnlocked())) throw new UserError("Settings PIN required", 401);

  const { confirm } = await parseJson(req, schema).catch(() => {
    throw new UserError('Type "DELETE EVERYTHING" exactly to confirm');
  });
  if (confirm !== "DELETE EVERYTHING") throw new UserError('Type "DELETE EVERYTHING" exactly to confirm');

  await resetAllData();
  return ok({ ok: true });
});
