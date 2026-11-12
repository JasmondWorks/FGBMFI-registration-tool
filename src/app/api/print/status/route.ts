import { refreshSpoolStatus } from "@/server/print";
import { handle, ok } from "@/server/http";

/** Spooler status for pages sent in direct mode. */
export const GET = handle(async (req: Request) => {
  const ids = (new URL(req.url).searchParams.get("pages") ?? "").split(",").filter(Boolean).slice(0, 300);
  return ok(await refreshSpoolStatus(ids));
});
