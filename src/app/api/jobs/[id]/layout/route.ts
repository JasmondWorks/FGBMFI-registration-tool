import { z } from "zod";

import { layoutJob } from "@/server/pages";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const ids = z.array(z.string().uuid()).max(2000).optional();
const schema = z.object({
  order: ids,
  addCardIds: ids,
  removeCardIds: ids,
  holdCardIds: ids,
  allowUnderfilled: z.boolean().optional(),
});

/**
 * (Re)builds the job's unprinted pages, 4 badges per sheet in order.
 * Returns needsCountFix when the total isn't a multiple of 4 (nothing is changed then).
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/jobs/[id]/layout">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  return ok(await layoutJob(id, body, operator));
});
