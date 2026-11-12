import { z } from "zod";

import { addReconciledCard } from "@/server/reconcile";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({ stagingId: z.string().uuid() });

/**
 * For a badge the scan found no match for: the file was already analyzed and staged via
 * the normal /api/intake/analyze (same extraction, duplicate-aware), and this saves it
 * straight as PRINTED instead of landing in the queue, since it's already out.
 */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { stagingId } = await parseJson(req, schema);
  return ok(await addReconciledCard({ stagingId, operator }));
});
