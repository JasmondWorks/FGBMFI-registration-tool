import { z } from "zod";

import { commitIntake } from "@/server/intake";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({
  jobId: z.string().uuid().nullish(),
  items: z.array(z.object({ stagingId: z.string().uuid(), supersedeCardIds: z.array(z.string().uuid()).optional() })).max(1000),
  excludedStagingIds: z.array(z.string().uuid()).max(1000).default([]),
  excludedReasons: z.record(z.string(), z.string().max(200)).optional(),
});

/** Accepts analysed files as badges in an upload job (new, or an existing one when adding more). */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const body = await parseJson(req, schema);
  return ok(await commitIntake({ ...body, operator }));
});
