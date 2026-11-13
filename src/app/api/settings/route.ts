import { getPrintSettings, printSettingsSchema, savePrintSettings } from "@/server/settings";
import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";
import { isUnlocked } from "@/server/settings-auth";

// Reading settings stays open — the print pipeline itself depends on these values
// (offsets, printer name) on every single print, independent of the Settings page.
// Only changing them requires the PIN.
export const GET = handle(async () => ok(await getPrintSettings()));

export const PUT = handle(async (req: Request) => {
  requireOperator(req);
  if (!(await isUnlocked())) throw new UserError("Settings PIN required", 401);
  const body = await parseJson(req, printSettingsSchema);
  return ok(await savePrintSettings(body));
});
