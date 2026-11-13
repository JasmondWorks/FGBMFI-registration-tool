import { z } from "zod";

import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";

const schema = z.object({ pin: z.string() });

/** Checks a PIN against RESET_PIN without performing any destructive action — used to gate the whole Settings page. */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  const expectedPin = process.env.RESET_PIN;
  if (!expectedPin) throw new UserError("RESET_PIN isn't set on the server, so settings are locked. Set it in the environment first.", 500);

  const { pin } = await parseJson(req, schema).catch(() => {
    throw new UserError("Enter the PIN to continue");
  });
  if (pin !== expectedPin) throw new UserError("Wrong PIN");

  return ok({ ok: true });
});
