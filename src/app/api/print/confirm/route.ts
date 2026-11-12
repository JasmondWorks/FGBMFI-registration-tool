import { z } from "zod";

import { confirmPages } from "@/server/pages";
import { handle, ok, parseJson, requireOperator } from "@/server/http";

const schema = z.object({
  pages: z
    .array(
      z.object({
        pageId: z.string().uuid(),
        printedItemIds: z.array(z.string().uuid()).max(4),
        failedItemIds: z.array(z.string().uuid()).max(4),
      }),
    )
    .min(1)
    .max(300),
});

/** The operator's answer to "did these print correctly?". This is what marks badges printed. */
export const POST = handle(async (req: Request) => {
  const operator = requireOperator(req);
  const { pages } = await parseJson(req, schema);
  await confirmPages(pages, operator);
  return ok({ confirmed: pages.length });
});
