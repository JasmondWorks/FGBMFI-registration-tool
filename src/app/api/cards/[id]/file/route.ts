import { getCardFileInfo } from "@/server/cards";
import { fail, handle } from "@/server/http";
import { readStoredFile } from "@/server/storage";

/** The original badge file. Local copy first; Cloudinary backup if the local file is gone. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/cards/[id]/file">) => {
  const { id } = await ctx.params;
  const info = await getCardFileInfo(id);
  if (!info) return fail("Badge not found", 404);
  const bytes = await readStoredFile(info.localPath);
  if (!bytes) {
    if (info.cloudinaryUrl) return Response.redirect(info.cloudinaryUrl, 302);
    return fail("The file is missing on this laptop and has no cloud copy", 404);
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = info.originalFilename.replace(/[^\w.\- ()]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": info.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
});
