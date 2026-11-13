import { getUnconfirmedCount } from "@/server/pages";
import { handle, ok } from "@/server/http";

export const GET = handle(async () => ok(await getUnconfirmedCount()));
