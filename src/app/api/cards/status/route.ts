import { getCardStatuses } from "@/server/queue";
import { handle, ok } from "@/server/http";

/** Live status (+ queue position, if still queued) for a specific set of badges. */
export const GET = handle(async (req: Request) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  return ok(await getCardStatuses(ids));
});
