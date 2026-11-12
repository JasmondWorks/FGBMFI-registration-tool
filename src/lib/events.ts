"use client";

import * as React from "react";

/**
 * A tiny app-wide "something changed" signal. After uploads, prints, confirmations and
 * edits we emit it, and any screen showing desk data refetches.
 */
const EVENT = "desk:changed";

export function emitDeskChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function useDeskChanged(callback: () => void) {
  const ref = React.useRef(callback);
  React.useEffect(() => {
    ref.current = callback;
  });
  React.useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}

/** Minimal data hook: fetch on mount / key change / desk change, with loading and error state. */
export function useFetch<T>(key: string | null, fetcher: () => Promise<T>) {
  const [state, setState] = React.useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: !!key,
  });
  const fetcherRef = React.useRef(fetcher);
  React.useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const seq = React.useRef(0);

  const reload = React.useCallback(async () => {
    if (!key) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetcherRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (id === seq.current) setState((s) => ({ data: s.data, error: err instanceof Error ? err.message : "Failed to load", loading: false }));
    }
  }, [key]);

  React.useEffect(() => {
    void reload();
  }, [reload]);
  useDeskChanged(() => void reload());
  return { ...state, reload };
}
