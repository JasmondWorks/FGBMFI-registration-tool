import { parseQueueQuery } from "@/lib/queue-query";
import { listQueue } from "@/server/queue";
import { handle, ok } from "@/server/http";

export const GET = handle(async (req: Request) => {
  const q = parseQueueQuery(new URL(req.url).searchParams);
  return ok(await listQueue(q));
});
