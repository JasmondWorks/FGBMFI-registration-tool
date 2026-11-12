import { z } from "zod";

import { resetAllData } from "@/server/admin";
import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";

const schema = z.object({ confirm: z.literal("DELETE EVERYTHING") });

/** Wipes all badges, pages, jobs and audit history. Requires an exact confirmation phrase. */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  const { confirm } = await parseJson(req, schema).catch(() => {
    throw new UserError('Type "DELETE EVERYTHING" exactly to confirm');
  });
  if (confirm !== "DELETE EVERYTHING") throw new UserError('Type "DELETE EVERYTHING" exactly to confirm');
  await resetAllData();
  return ok({ ok: true });
});
