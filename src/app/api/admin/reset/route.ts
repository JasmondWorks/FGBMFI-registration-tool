import { z } from "zod";

import { resetAllData } from "@/server/admin";
import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";

const schema = z.object({ confirm: z.literal("DELETE EVERYTHING"), pin: z.string() });

/**
 * Wipes all badges, pages, jobs and audit history. Requires the exact confirmation
 * phrase AND the reset PIN (RESET_PIN in the environment) — the phrase alone is too easy
 * to type without meaning to; the PIN is the part that has to be deliberately known.
 */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  const expectedPin = process.env.RESET_PIN;
  if (!expectedPin) throw new UserError("RESET_PIN isn't set on the server, so resetting is disabled. Set it in the environment first.", 500);

  const { confirm, pin } = await parseJson(req, schema).catch(() => {
    throw new UserError('Type "DELETE EVERYTHING" exactly and enter the PIN to confirm');
  });
  if (confirm !== "DELETE EVERYTHING") throw new UserError('Type "DELETE EVERYTHING" exactly to confirm');
  if (pin !== expectedPin) throw new UserError("Wrong PIN");

  await resetAllData();
  return ok({ ok: true });
});
