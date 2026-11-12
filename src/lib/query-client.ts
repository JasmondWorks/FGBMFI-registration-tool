import { QueryClient } from "@tanstack/react-query";

/**
 * Multiple operators work on the same desk data at once, from different devices, so a
 * screen can go stale the moment someone else uploads, prints, or edits. Refetch on
 * window focus (coming back to a tab) and on a short interval (while a tab stays open)
 * closes that gap without anyone needing to manually refresh.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchInterval: 8_000,
      staleTime: 2_000,
      retry: 1,
    },
  },
});
