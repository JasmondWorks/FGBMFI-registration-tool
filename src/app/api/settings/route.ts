import { getPrintSettings, printSettingsSchema, savePrintSettings } from "@/server/settings";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

export const GET = handle(async () => ok(await getPrintSettings()));

export const PUT = handle(async (req: Request) => {
  requireOperator(req);
  const body = await parseJson(req, printSettingsSchema);
  return ok(await savePrintSettings(body));
});
