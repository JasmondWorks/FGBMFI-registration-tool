import { z } from "zod";

import { parseQueueQuery } from "@/lib/queue-query";
import { buildFromQueue } from "@/server/queue";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({
  cardIds: z.array(z.string().uuid()).max(2000).optional(),
  district: z.string().optional(),
  allowUnderfilled: z.boolean().optional(),
});

/**
 * Builds one page from the queue. With cardIds: exactly those badges (manual pick).
 * Without: the next CARDS_PER_PAGE in queue order, optionally scoped to one district.
 */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const body = await parseJson(req, schema);
  const filter = body.cardIds ? undefined : parseQueueQuery({ district: body.district ?? "" });
  return ok(await buildFromQueue({ cardIds: body.cardIds, filter, allowUnderfilled: body.allowUnderfilled }, operator));
});
