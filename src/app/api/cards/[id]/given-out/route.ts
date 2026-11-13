import { markGivenOut, undoGivenOut } from "@/server/cards";
import { handle, ok, requireOperator } from "@/server/http";

/** Marks a printed badge as physically handed to its owner. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]/given-out">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  return ok(await markGivenOut(id, operator));
});

/** Undoes a given-out mark — handed to the wrong person, or marked by mistake. */
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]/given-out">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  return ok(await undoGivenOut(id, operator));
});
