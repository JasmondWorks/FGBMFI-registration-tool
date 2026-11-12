import { z } from "zod";

import { buildFromQueue } from "@/server/queue";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({
  cardIds: z.array(z.string().uuid()).max(2000).optional(),
  allowUnderfilled: z.boolean().optional(),
});

/** Builds one page from the queue. With cardIds: exactly those badges (manual pick). Without: the next CARDS_PER_PAGE in queue order. */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const body = await parseJson(req, schema);
  return ok(await buildFromQueue({ cardIds: body.cardIds, allowUnderfilled: body.allowUnderfilled }, operator));
});
