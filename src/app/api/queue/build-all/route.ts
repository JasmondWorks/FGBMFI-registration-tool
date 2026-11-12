import { buildAllFromQueue } from "@/server/queue";
import { handle, ok, requireOperator } from "@/server/http";

/** Builds every complete sheet the queue currently supports. Called automatically after an upload. */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const result = await buildAllFromQueue(operator);
  return ok(result);
});
