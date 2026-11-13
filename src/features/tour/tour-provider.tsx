"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { createStoredStore } from "@/lib/stored-store";
import { useIsMobile } from "@/lib/use-is-mobile";
import { getTourSteps } from "./tour-steps";

const seenStore = createStoredStore<boolean>("desk.tourSeen", "local", false);

type TourState = { active: boolean; step: number };
const TourContext = React.createContext<{
  state: TourState;
  steps: ReturnType<typeof getTourSteps>;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
} | null>(null);

/**
 * Runs once automatically on a first visit (any page); replayable any time via the topbar
 * button. Always starts from the home page, since the first couple of steps point at
 * things (the upload drop zone) that only exist there.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const steps = React.useMemo(() => getTourSteps(isMobile), [isMobile]);
  const [state, setState] = React.useState<TourState>({ active: false, step: 0 });
  const [seen] = seenStore.useValue();

  const begin = React.useCallback(() => {
    if (pathname !== "/") router.push("/");
    setState({ active: true, step: 0 });
  }, [pathname, router]);

  // This has to be an effect, not a render-time check: useSyncExternalStore returns the
  // SSR-safe placeholder (false) during hydration, and the real localStorage value only
  // arrives via React's own re-render afterward — reacting to it at render time would
  // catch the stale placeholder and wrongly re-show the tour to returning users.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (!seen) begin();
    // Only ever auto-starts on the very first time `seen` resolves to false; `begin`
    // intentionally isn't a dependency here (it changes with every navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);

  const finish = React.useCallback(() => {
    seenStore.set(true);
    setState({ active: false, step: 0 });
  }, []);
  const next = React.useCallback(() => {
    setState((s) => {
      if (s.step + 1 >= steps.length) {
        seenStore.set(true);
        return { active: false, step: 0 };
      }
      return { ...s, step: s.step + 1 };
    });
  }, [steps.length]);
  const back = React.useCallback(() => setState((s) => ({ ...s, step: Math.max(0, s.step - 1) })), []);

  const value = React.useMemo(
    () => ({ state, steps, start: begin, next, back, skip: finish }),
    [state, steps, begin, next, back, finish],
  );
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}
