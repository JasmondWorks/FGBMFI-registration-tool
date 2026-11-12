import { parseQueueQuery } from "@/lib/queue-query";
import { getQueueDistricts, listQueue } from "@/server/queue";
import { handle, ok } from "@/server/http";

export const GET = handle(async (req: Request) => {
  const q = parseQueueQuery(new URL(req.url).searchParams);
  const [list, districts] = await Promise.all([listQueue(q), getQueueDistricts(q)]);
  return ok({ ...list, districts });
});
