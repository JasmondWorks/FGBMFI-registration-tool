"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useMode } from "./use-mode";

/**
 * `?mode=uploader` or `?mode=printer` on any link sets this device's mode on load — so a
 * link handed to the uploaders' machines and a different one handed to the printer station
 * each configure themselves, with nothing for either person to click. Strips the param
 * back out once applied so it doesn't linger in the address bar or get bookmarked stale.
 */
export function ModeFromUrl() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [, setMode] = useMode();
  const raw = searchParams.get("mode");

  React.useEffect(() => {
    if (raw !== "uploader" && raw !== "printer") return;
    setMode(raw);
    const next = new URLSearchParams(searchParams);
    next.delete("mode");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // Intentionally only reacting to the param itself — re-running this on every
    // searchParams/router identity change would fight the replace() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  return null;
}
