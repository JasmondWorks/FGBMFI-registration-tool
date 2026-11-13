import { getCardFileInfo } from "@/server/cards";
import { fail, handle } from "@/server/http";

/** The original badge file, served from its cloud copy — the only durable one. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]/file">) => {
  const { id } = await ctx.params;
  const info = await getCardFileInfo(id);
  if (!info) return fail("Badge not found", 404);
  if (!info.cloudinaryUrl) return fail("This badge has no cloud copy yet", 404);
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (!download) return Response.redirect(info.cloudinaryUrl, 302);
  const name = info.originalFilename.replace(/[^\w.\- ()]/g, "_");
  const res = await fetch(info.cloudinaryUrl);
  if (!res.ok || !res.body) return fail("Couldn't fetch the file from cloud storage", 502);
  return new Response(res.body, {
    headers: {
      "Content-Type": info.mimeType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
});
