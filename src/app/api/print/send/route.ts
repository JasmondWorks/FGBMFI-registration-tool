import { z } from "zod";

import { markSent } from "@/server/pages";
import { printDirect } from "@/server/print";
import { getPrintSettings } from "@/server/settings";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({ pageIds: z.array(z.string().uuid()).min(1).max(300) });

/**
 * Marks pages as sent. In direct mode the server also sends each sheet to the printer
 * and records the spooler job id. Badges are NOT marked printed here: that only happens
 * when the operator confirms.
 */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { pageIds } = await parseJson(req, schema);
  const settings = await getPrintSettings();
  if (settings.printMode === "DIRECT") {
    const spooler = await printDirect(pageIds, operator);
    return ok({ mode: "DIRECT" as const, spooler });
  }
  await markSent(pageIds, operator, "BROWSER");
  return ok({ mode: "BROWSER" as const, spooler: {} });
});
