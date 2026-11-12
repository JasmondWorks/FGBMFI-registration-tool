import { buildPagesPdf } from "@/server/print";
import { handle, UserError } from "@/server/http";

/** The exact PDF that goes to the printer: one A4 sheet per page, 4 badges each. */
export const GET = handle(async (req: Request) => {
  const ids = (new URL(req.url).searchParams.get("pages") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) throw new UserError("No pages selected");
  if (ids.length > 300) throw new UserError("Print at most 300 pages at a time");
  const { pdf } = await buildPagesPdf(ids);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="badges-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
