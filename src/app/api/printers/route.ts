import { connection } from "next/server";

import { listPrinters } from "@/server/print-agent";
import { handle, ok } from "@/server/http";

export const GET = handle(async () => {
  await connection();
  return ok(await listPrinters());
});
