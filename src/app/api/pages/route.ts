import { z } from "zod";

import { getPageViews, listPages } from "@/server/pages";
import { handle, ok } from "@/server/http";

const query = z.object({
  ids: z.string().optional(),
  status: z.enum(["SENT", "SPOOLED", "CONFIRMED", "PARTIAL", "CANCELLED"]).optional(),
  kind: z.enum(["UPLOAD", "REPRINT"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(5).max(100).default(20),
});

export const GET = handle(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (q.ids) return ok({ pages: await getPageViews(q.ids.split(",").filter(Boolean)), total: 0 });
  return ok(await listPages({ status: q.status, kind: q.kind, limit: q.size, offset: (q.page - 1) * q.size }));
});
