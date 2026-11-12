import { analyzeUpload } from "@/server/intake";
import { handle, ok, requireOperator, UserError } from "@/server/http";

/** Receives ONE file, stores it in staging, reads the badge and checks for duplicates. */
export const POST = handle(async (req: Request) => {
  requireOperator(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new UserError("No file received");
  return ok(await analyzeUpload(file));
});
