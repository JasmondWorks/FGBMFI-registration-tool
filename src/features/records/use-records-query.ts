"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseRecordsQuery, serializeList, type RecordsQuery } from "@/lib/records-query";

const LIST_KEYS = ["district", "chapter", "title", "status", "printedBy"] as const;

/** Records filters live in the URL so every filtered view can be bookmarked or refreshed. */
export function useRecordsQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = React.useMemo(() => parseRecordsQuery(params), [params]);

  const update = React.useCallback(
    (patch: Partial<RecordsQuery>, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) next.delete(key);
        else if ((LIST_KEYS as readonly string[]).includes(key)) next.set(key, serializeList(value as string[]));
        else next.set(key, String(value));
      }
      if (!opts.keepPage && !("p" in patch)) next.delete("p");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** The query string the API understands (URL params minus the overlay params). */
  const apiParams = React.useMemo(() => {
    const p = new URLSearchParams(params.toString());
    for (const k of ["view", "page", "job", "tab"]) p.delete(k);
    return p.toString();
  }, [params]);

  const activeCount =
    LIST_KEYS.reduce((n, k) => n + query[k].length, 0) + (query.q ? 1 : 0) + (query.review ? 1 : 0) + (query.reprinted ? 1 : 0) + (query.from || query.to ? 1 : 0);

  const clear = React.useCallback(() => {
    const keep = new URLSearchParams();
    const tab = params.get("tab");
    if (tab) keep.set("tab", tab);
    router.replace(keep.toString() ? `${pathname}?${keep}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return { query, update, apiParams, activeCount, clear };
}
