import { z } from "zod";

import { checkCount } from "@/lib/paging";
import { createReprintJob, getTray, layoutJob } from "@/server/pages";
import { handle, ok, parseJson, requireOperator, UserError } from "@/server/http";

const schema = z.object({
  cardIds: z.array(z.string().uuid()).min(1).max(1200),
  reason: z.string().trim().min(2, "Give a reason for the reprint").max(300),
  fillFromTray: z.boolean().optional(),
  allowUnderfilled: z.boolean().optional(),
});

/**
 * Creates a reprint job and lays it out into sheets of 4. The count is checked first,
 * so nothing is created until the operator has settled the multiple-of-4 rule.
 */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const body = await parseJson(req, schema);
  const cardIds = [...new Set(body.cardIds)];

  let trayIds: string[] = [];
  if (body.fillFromTray) {
    const tray = await getTray();
    const missing = checkCount(cardIds.length).missing;
    trayIds = tray.map((t) => t.id).filter((id) => !cardIds.includes(id)).slice(0, missing);
    if (trayIds.length === 0) throw new UserError("The waiting tray is empty");
  }

  const total = cardIds.length + trayIds.length;
  const count = checkCount(total);
  if (!count.ok && !body.allowUnderfilled) {
    return ok({ needsCountFix: true as const, total, remainder: count.remainder, missing: count.missing, jobId: null });
  }

  const jobId = await createReprintJob({ cardIds, reason: body.reason, operator });
  const result = await layoutJob(jobId, { addCardIds: [...cardIds, ...trayIds], allowUnderfilled: body.allowUnderfilled }, operator);
  return ok({ needsCountFix: false as const, jobId, job: result.job });
});
