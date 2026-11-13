import { handle, ok } from "@/server/http";
import { isUnlocked } from "@/server/settings-auth";

/** Whether this browser already has a valid unlock cookie, so the gate doesn't ask for the PIN again mid-session. */
export const GET = handle(async () => ok({ unlocked: await isUnlocked() }));
