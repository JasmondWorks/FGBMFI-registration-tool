import { parseRecordsQuery } from "@/lib/records-query";
import { getFacets } from "@/server/cards";
import { handle, ok } from "@/server/http";

export const GET = handle(async (req: Request) => ok(await getFacets(parseRecordsQuery(new URL(req.url).searchParams))));
