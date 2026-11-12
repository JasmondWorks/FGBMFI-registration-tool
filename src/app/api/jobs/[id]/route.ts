import { getJobView } from "@/server/pages";
import { handle, ok } from "@/server/http";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/jobs/[id]">) => {
  const { id } = await ctx.params;
  return ok(await getJobView(id));
});
