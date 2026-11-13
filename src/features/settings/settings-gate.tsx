"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { createStoredStore } from "@/lib/stored-store";
import { useOperator } from "@/features/operator/operator-context";

// Session-only (not localStorage): closing the tab re-locks settings, same as before where
// the PIN had to be re-typed for every reset. Holding the verified PIN itself (not just a
// bool) lets the danger zone reuse it without asking a second time.
const pinStore = createStoredStore<string>("desk.settingsPin", "session", "");

const SettingsPinContext = React.createContext<string>("");

/** The PIN already verified by SettingsGate, for actions further down the page (e.g. reset) that still need to send it. */
export function useSettingsPin() {
  return React.useContext(SettingsPinContext);
}

/** Locks the entire Settings page behind the reset PIN — nothing under it renders until entered. */
export function SettingsGate({ children }: { children: React.ReactNode }) {
  const { requireOperator } = useOperator();
  const [pin] = pinStore.useValue();
  const [entry, setEntry] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (pin) {
    return <SettingsPinContext.Provider value={pin}>{children}</SettingsPinContext.Provider>;
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!requireOperator()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/verify-pin", { method: "POST", json: { pin: entry } });
      pinStore.set(entry);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 px-5 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Settings are locked</h1>
        <p className="text-sm text-muted-foreground">Enter the desk PIN to view printer settings and the danger zone.</p>
      </div>
      <form onSubmit={unlock} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-pin">PIN</Label>
          <Input
            id="settings-pin"
            type="password"
            inputMode="numeric"
            autoFocus
            value={entry}
            onChange={(e) => {
              setEntry(e.target.value);
              setError(null);
            }}
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button type="submit" disabled={!entry || busy}>
          {busy ? "Checking..." : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
