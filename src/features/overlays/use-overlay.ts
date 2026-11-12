"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Viewers and the print preview are driven by the URL (?view=, ?page=, ?job=) so they
 * open from anywhere, survive a refresh, and the back button closes them.
 */
export type OverlayKind = "view" | "page" | "job";

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

  return {
    view: params.get("view"),
    page: params.get("page"),
    job: params.get("job"),
    open,
    close,
  };
}
