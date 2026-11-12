import { toCardSummary } from "@/server/mappers";
import { clearTray, getTray } from "@/server/pages";
import { handle, ok, requireOperator } from "@/server/http";

export const GET = handle(async () => ok((await getTray()).map(toCardSummary)));

/** Releases tray badges back to "not printed" without printing them. */
export const DELETE = handle(async (req: Request) => {
  const operator = requireOperator(req);
  return ok({ released: await clearTray(operator) });
});
