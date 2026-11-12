import { inArray } from "drizzle-orm";

import { parseRecordsQuery } from "@/lib/records-query";
import { listCardIds, listCards } from "@/server/cards";
import { db } from "@/server/db";
import { cards } from "@/server/db/schema";
import { handle, ok } from "@/server/http";
import { toCardSummary } from "@/server/mappers";

/**
 * Records table data. With ?idsOnly=1 returns every matching id (for "select all matching").
 * With ?ids=a,b,c returns exactly those badges, in that order (for the reprint list).
 */
export const GET = handle(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const ids = (params.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 1500);
  if (params.has("ids")) {
    const rows = ids.length ? await db.select().from(cards).where(inArray(cards.id, ids)) : [];
    const byId = new Map(rows.map((r) => [r.id, toCardSummary(r)]));
    const ordered = ids.map((id) => byId.get(id)).filter((c) => !!c);
    return ok({ rows: ordered, total: ordered.length });
  }
  const q = parseRecordsQuery(params);
  if (params.get("idsOnly") === "1") return ok({ ids: await listCardIds(q) });
  return ok(await listCards(q));
});
