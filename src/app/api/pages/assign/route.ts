import { z } from "zod";

import { assignSlotCard } from "@/server/pages";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({ pageId: z.string().uuid(), slot: z.number().int().min(1).max(4), cardId: z.string().uuid() });

/** Fills an empty slot or replaces an occupied one with a specific badge picked by search. */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { pageId, slot, cardId } = await parseJson(req, schema);
  await assignSlotCard(pageId, slot, cardId, operator);
  return ok({ ok: true });
});
