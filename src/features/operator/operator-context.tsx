"use client";

import * as React from "react";

import { getOperator, setOperatorName } from "@/lib/api";

type OperatorContextValue = {
  operator: string;
  ready: boolean;
  setOperator: (name: string) => void;
  /** Returns true if an operator is set; otherwise opens the picker. */
  requireOperator: () => boolean;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
};

const OperatorContext = React.createContext<OperatorContextValue | null>(null);

// The operator name lives in localStorage. useSyncExternalStore gives the server an empty
// snapshot during hydration and then switches to the stored name without a mismatch.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const getServerSnapshot = () => "";
const getHydratedSnapshot = () => true;
const getServerHydrated = () => false;

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const operator = React.useSyncExternalStore(subscribe, getOperator, getServerSnapshot);
  const ready = React.useSyncExternalStore(subscribe, getHydratedSnapshot, getServerHydrated);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const setOperator = React.useCallback((name: string) => {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
    setOperatorName(clean);
    try {
      const recent = JSON.parse(localStorage.getItem("desk.recentOperators") ?? "[]") as string[];
      localStorage.setItem("desk.recentOperators", JSON.stringify([clean, ...recent.filter((r) => r !== clean)].slice(0, 6)));
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  }, []);

  const requireOperator = React.useCallback(() => {
    if (getOperator()) return true;
    setPickerOpen(true);
    return false;
  }, []);

  const value = React.useMemo(
    () => ({ operator, ready, setOperator, requireOperator, pickerOpen, setPickerOpen }),
    [operator, ready, setOperator, requireOperator, pickerOpen],
  );
  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  const ctx = React.useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used inside OperatorProvider");
  // Read the store here too, so components inside Suspense boundaries hydrate with
  // the server snapshot and then update, instead of receiving the new value mid-hydration.
  const operator = React.useSyncExternalStore(subscribe, getOperator, getServerSnapshot);
  const ready = React.useSyncExternalStore(subscribe, getHydratedSnapshot, getServerHydrated);
  return { ...ctx, operator, ready };
}
