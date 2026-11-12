import { quickFind } from "@/server/cards";
import { handle, ok } from "@/server/http";

export const GET = handle(async (req: Request) => ok(await quickFind(new URL(req.url).searchParams.get("q") ?? "")));
