import { z } from "zod";

import { confirmDispatched } from "@/server/reconcile";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({ cardIds: z.array(z.string().uuid()).min(1).max(500) });

/** Marks matched badges as printed, confirmed by photo instead of the normal print flow. */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { cardIds } = await parseJson(req, schema);
  return ok(await confirmDispatched(cardIds, operator));
});
