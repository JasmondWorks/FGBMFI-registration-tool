import { connection } from "next/server";

import { retryCloudSync } from "@/server/intake";
import { getDeskOverview } from "@/server/pages";
import { handle, ok } from "@/server/http";

let resumed = false;

export const GET = handle(async () => {
  await connection();
  // After a restart, pick up any cloud backups that didn't finish.
  if (!resumed) {
    resumed = true;
    void retryCloudSync().catch(() => undefined);
  }
  return ok(await getDeskOverview());
});
