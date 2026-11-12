import { fail, handle } from "@/server/http";
import { readStagingFile } from "@/server/storage";

/** Serves a staged (not yet accepted) file so it can be previewed in the duplicate check. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/intake/staging/[id]">) => {
  const { id } = await ctx.params;
  const file = await readStagingFile(id);
  if (!file) return fail("File not found or expired", 404);
  return new Response(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=3600" },
  });
});
