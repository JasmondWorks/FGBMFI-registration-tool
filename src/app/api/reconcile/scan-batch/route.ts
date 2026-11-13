import { scanPrintedBadges } from "@/server/reconcile";
import { handle, ok, requireOperator, UserError } from "@/server/http";

const MAX_PER_BATCH = 20;

/** Reads a whole batch of already-printed-badge photos in one call. */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new UserError("No photos received");
  if (files.length > MAX_PER_BATCH) throw new UserError(`Up to ${MAX_PER_BATCH} photos at once — split the rest into another batch`);

  const bytes = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  const results = await scanPrintedBadges(bytes);
  return ok(results.map((r, i) => ({ ...r, photoName: files[i].name })));
});
