import { z } from "zod";

const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split("|").filter(Boolean) : []));

export const queueQuerySchema = z.object({
  q: z.string().optional().default(""),
  district: list,
  p: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(10).max(200).optional().default(50),
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;

export function parseQueueQuery(params: URLSearchParams | Record<string, string | undefined>): QueueQuery {
  const obj = params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
  const result = queueQuerySchema.safeParse(obj);
  return result.success ? result.data : queueQuerySchema.parse({});
}
