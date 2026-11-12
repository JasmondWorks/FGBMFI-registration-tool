"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { queryClient } from "./query-client";

/**
 * After a mutation (upload, print, confirm, edit, delete) every screen showing desk data
 * should refresh immediately, not wait for the next poll — this invalidates everything in
 * the cache so any mounted query refetches right away. Combined with useFetch's
 * window-focus and interval refetching, this is what keeps multiple operators on
 * different devices looking at consistent data.
 */
export function emitDeskChanged() {
  void queryClient.invalidateQueries();
}

/** Kept for any code still listening for the old DOM event name; not used internally anymore. */
export function useDeskChanged(callback: () => void) {
  void callback;
}

/**
 * Data hook: fetch on mount / key change, refetch on window focus and on a short interval
 * (see query-client.ts), and after any mutation anywhere via emitDeskChanged(). Same shape
 * as before react-query so call sites didn't need to change.
 */
export function useFetch<T>(key: string | null, fetcher: () => Promise<T>) {
  const query = useQuery<T>({
    queryKey: [key],
    queryFn: fetcher,
    enabled: key !== null,
    // Keeps showing the previous key's data (with loading=true) instead of flashing to
    // empty while a new key's fetch is in flight — e.g. typing in a search box shouldn't
    // blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
  return {
    data: query.data ?? null,
    error: query.error ? (query.error instanceof Error ? query.error.message : "Failed to load") : null,
    loading: query.isFetching,
    reload: async () => {
      await query.refetch();
    },
  };
}
