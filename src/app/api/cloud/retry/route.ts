import { retryCloudSync } from "@/server/intake";
import { handle, ok, requireOperator } from "@/server/http";

export const POST = handle(async (req: Request) => {
  requireOperator(req);
  return ok({ queued: await retryCloudSync() });
});
