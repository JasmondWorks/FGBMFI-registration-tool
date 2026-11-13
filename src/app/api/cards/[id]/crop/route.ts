import { z } from "zod";

import { setCardCropBox } from "@/server/cards";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]/crop">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  const cropBox = await parseJson(req, schema);
  return ok(await setCardCropBox(id, cropBox, operator));
});
