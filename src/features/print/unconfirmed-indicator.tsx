"use client";

import * as React from "react";

import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { cn, pluralize } from "@/lib/utils";
import { usePrint } from "./print-provider";

type Unconfirmed = { ids: string[]; oldestSentAt: string | null };

/**
 * A sheet that's been sent to the printer but never confirmed is a silent gap: the system
 * has no reliable way to tell an operator whether that delegate's badge is actually ready
 * to collect. Visible on every page (not buried in the home page) so it can't sit ignored
 * indefinitely, and gets visibly more urgent the longer it's waited.
 */
export function UnconfirmedIndicator() {
  const { openConfirm } = usePrint();
  const { data } = useFetch("unconfirmed-count", () => api<Unconfirmed>("/api/pages/unconfirmed"));
  const count = data?.ids.length ?? 0;

  // "Urgent" depends on elapsed wall-clock time, which can only ever be read inside an
  // effect (Date.now() during render is impure/unstable) — this just re-checks on a timer.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(t);
  }, []);

  if (count === 0) return null;
  const urgent = !!data?.oldestSentAt && now - new Date(data.oldestSentAt).getTime() > 3 * 60 * 1000;

  return (
    <button
      type="button"
      onClick={() => data && openConfirm(data.ids)}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        urgent ? "animate-pulse border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning-soft text-[oklch(0.45_0.1_65)]",
      )}
      title="Sheets sent to the printer that nobody's confirmed yet"
    >
      <span className="tnum">{count}</span>
      <span className="hidden sm:inline">{pluralize(count, "sheet")} to confirm</span>
    </button>
  );
}
