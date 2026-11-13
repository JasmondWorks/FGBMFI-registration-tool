"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useMode, type DeskMode } from "./use-mode";

const VALID_MODES: DeskMode[] = ["uploader", "printer", "collection"];

/**
 * `?mode=uploader`, `?mode=printer` or `?mode=collection` on any link sets this device's
 * mode on load — so a link handed to the uploaders' machines, a different one to the
 * printer station, and another to the collection point each configure themselves, with
 * nothing for anyone to click. Strips the param back out once applied so it doesn't linger
 * in the address bar or get bookmarked stale. Checked against VALID_MODES (not a fixed
 * list of literals) so a future new mode can't silently fall through this check again.
 */
export function ModeFromUrl() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [, setMode] = useMode();
  const raw = searchParams.get("mode");

  React.useEffect(() => {
    if (!VALID_MODES.includes(raw as DeskMode)) return;
    setMode(raw as DeskMode);
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
