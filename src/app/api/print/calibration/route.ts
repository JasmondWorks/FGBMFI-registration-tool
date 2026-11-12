import { buildCalibrationPdf } from "@/server/sheet-pdf";
import { getPrintSettings } from "@/server/settings";
import { handle } from "@/server/http";

export const GET = handle(async () => {
  const pdf = await buildCalibrationPdf(await getPrintSettings());
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
});
