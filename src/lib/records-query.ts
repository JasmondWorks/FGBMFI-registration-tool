import { z } from "zod";

/**
 * Filters for the records table. They live in the URL so any filtered view can be
 * bookmarked, shared on the laptop, or reopened after a refresh.
 */
const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split("|").filter(Boolean) : []));

export const recordsQuerySchema = z.object({
  q: z.string().optional().default(""),
  district: list,
  chapter: list,
  title: list,
  status: list,
  printedBy: list,
  review: z.enum(["yes", "no"]).optional(),
  reprinted: z.enum(["yes", "no"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z
    .enum(["name", "-name", "lastPrinted", "-lastPrinted", "printCount", "-printCount", "chapter", "-chapter", "district", "-district", "created", "-created"])
    .optional()
    .default("-created"),
  p: z.coerce.number().int().min(1).optional().default(1), // table page (?page= is the sheet viewer)
  size: z.coerce.number().int().min(10).max(200).optional().default(25),
});

export type RecordsQuery = z.infer<typeof recordsQuerySchema>;

export function parseRecordsQuery(params: URLSearchParams | Record<string, string | undefined>): RecordsQuery {
  const obj = params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
  const result = recordsQuerySchema.safeParse(obj);
  return result.success ? result.data : recordsQuerySchema.parse({});
}

/** Multi-value filters are joined with "|" in the URL (chapter names can contain commas). */
export function serializeList(values: string[]) {
  return values.join("|");
}
