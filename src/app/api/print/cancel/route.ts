import { z } from "zod";

import { cancelSent } from "@/server/pages";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({ pageIds: z.array(z.string().uuid()).min(1).max(300) });

/** "Nothing printed": the pages go back to ready so they can be printed again. */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { pageIds } = await parseJson(req, schema);
  await cancelSent(pageIds, operator);
  return ok({ cancelled: pageIds.length });
});
