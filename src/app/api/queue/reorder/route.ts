import { z } from "zod";

import { reorderQueue } from "@/server/queue";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({ orderedIds: z.array(z.string().uuid()).min(1).max(500) });

export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { orderedIds } = await parseJson(req, schema);
  await reorderQueue(orderedIds, operator);
  return ok({ ok: true });
});
