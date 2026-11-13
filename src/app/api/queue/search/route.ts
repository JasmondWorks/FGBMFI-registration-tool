import { searchQueueWithStatus } from "@/server/queue";
import { handle, ok } from "@/server/http";

/** Search the shared queue by name, with each match's sheet grouping — available from any mode/device. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await searchQueueWithStatus(q));
});
