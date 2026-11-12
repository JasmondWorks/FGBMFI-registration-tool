import { scanPrintedBadge } from "@/server/reconcile";
import { handle, ok, requireOperator, UserError } from "@/server/http";

/** Reads one photo of an already-printed badge: OCR + match against existing cards. */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new UserError("No photo received");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await scanPrintedBadge(bytes);
  return ok(result);
});
