"use client";

import * as React from "react";

import { createStoredStore } from "@/lib/stored-store";
import { TOUR_STEPS } from "./tour-steps";

const seenStore = createStoredStore<boolean>("desk.tourSeen", "local", false);

type TourState = { active: boolean; step: number };
const TourContext = React.createContext<{
  state: TourState;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
} | null>(null);

/** Runs once automatically on a first visit (any page); replayable any time via the topbar button. */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<TourState>({ active: false, step: 0 });
  const [seen] = seenStore.useValue();

  // This has to be an effect, not a render-time check: useSyncExternalStore returns the
  // SSR-safe placeholder (false) during hydration, and the real localStorage value only
  // arrives via React's own re-render afterward — reacting to it at render time would
  // catch the stale placeholder and wrongly re-show the tour to returning users.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (!seen) setState({ active: true, step: 0 });
  }, [seen]);

  const start = React.useCallback(() => setState({ active: true, step: 0 }), []);
  const finish = React.useCallback(() => {
    seenStore.set(true);
    setState({ active: false, step: 0 });
  }, []);
  const next = React.useCallback(() => {
    setState((s) => {
      if (s.step + 1 >= TOUR_STEPS.length) {
        seenStore.set(true);
        return { active: false, step: 0 };
      }
      return { ...s, step: s.step + 1 };
    });
  }, []);
  const back = React.useCallback(() => setState((s) => ({ ...s, step: Math.max(0, s.step - 1) })), []);

  const value = React.useMemo(() => ({ state, start, next, back, skip: finish }), [state, start, next, back, finish]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}
