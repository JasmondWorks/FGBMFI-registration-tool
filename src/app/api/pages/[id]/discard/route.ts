import { discardPage } from "@/server/pages";
import { handle, ok, requireOperator } from "@/server/http";

/** Throws away a whole not-yet-printed sheet — a test batch, or built by mistake. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/pages/[id]/discard">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  await discardPage(id, operator);
  return ok({ ok: true });
});
