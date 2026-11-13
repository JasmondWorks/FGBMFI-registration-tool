import { z } from "zod";

import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";
import { issueUnlockCookie, verifyPin } from "@/server/settings-auth";

const schema = z.object({ pin: z.string() });

/**
 * Checks a PIN against RESET_PIN and, if correct, issues a signed HttpOnly cookie that
 * authorizes the rest of the Settings page — the PIN itself never goes back to the client
 * or gets held in browser storage.
 */
export const POST = handle(async (req: Request) => {
  requireOperator(req);

  const { pin } = await parseJson(req, schema).catch(() => {
    throw new UserError("Enter the PIN to continue");
  });
  if (!verifyPin(pin)) throw new UserError("Wrong PIN");

  await issueUnlockCookie();
  return ok({ ok: true });
});
