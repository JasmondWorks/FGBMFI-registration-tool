import { z } from "zod";

import { deleteCard, getCardDetail, logViewed, updateCard } from "@/server/cards";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]">) => {
  const { id } = await ctx.params;
  const detail = await getCardDetail(id);
  // Opening a badge is part of the audit trail.
  const operator = req.headers.get("x-operator");
  if (operator) await logViewed(id, decodeURIComponent(operator).slice(0, 80));
  return ok(detail);
});

const editSchema = z.object({
  fullName: z.string().max(200).optional(),
  titles: z.array(z.string().max(40)).max(10).optional(),
  district: z.string().max(200).nullable().optional(),
  chapter: z.string().max(200).nullable().optional(),
  registrationId: z.string().max(100).nullable().optional(),
  markReviewed: z.boolean().optional(),
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  return ok(await updateCard(id, await parseJson(req, editSchema), operator));
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]">) => {
  const operator = requireOperator(req);
  const { id } = await ctx.params;
  return ok(await deleteCard(id, operator));
});
