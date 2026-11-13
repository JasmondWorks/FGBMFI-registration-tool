"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Viewers, the print preview and the reprint builder are driven by the URL (?view=,
 * ?page=, ?job=, ?reprint=) so they open from anywhere without leaving the page you were
 * on, survive a refresh, and the back button closes them.
 */
export type OverlayKind = "view" | "page" | "job" | "reprint";

export function useOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const open = React.useCallback(
    (kind: OverlayKind, id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(kind, id);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const close = React.useCallback(
    (kind: OverlayKind) => {
      const next = new URLSearchParams(params.toString());
      next.delete(kind);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Closing one overlay and opening another in two separate calls races: each reads the
  // same pre-navigation searchParams snapshot, so the second call can silently resurrect
  // what the first just removed. This does both in one navigation.
  const swap = React.useCallback(
    (from: OverlayKind, to: OverlayKind, id: string) => {
      const next = new URLSearchParams(params.toString());
      next.delete(from);
      next.set(to, id);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    view: params.get("view"),
    page: params.get("page"),
    job: params.get("job"),
    reprint: params.get("reprint"),
    open,
    close,
    swap,
  };
}
