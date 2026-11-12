import { z } from "zod";

import { swapSlots } from "@/server/pages";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const slot = z.object({ pageId: z.string().uuid(), slot: z.number().int().min(1).max(4) });
const schema = z.object({ a: slot, b: slot });

export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { a, b } = await parseJson(req, schema);
  await swapSlots(a, b, operator);
  return ok({ swapped: true });
});
