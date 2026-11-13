"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useOperator } from "@/features/operator/operator-context";

/**
 * The PIN itself never lives in the browser — entering it right once gets a signed, HttpOnly
 * cookie from the server (see settings-auth.ts) that authorizes everything under Settings from
 * then on. This component just asks the server whether that cookie is currently valid.
 */
export function SettingsGate({ children }: { children: React.ReactNode }) {
  const { requireOperator } = useOperator();
  const [unlocked, setUnlocked] = React.useState<boolean | null>(null);
  const [entry, setEntry] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    api<{ unlocked: boolean }>("/api/admin/settings-status")
      .then((r) => setUnlocked(r.unlocked))
      .catch(() => setUnlocked(false));
  }, []);

  if (unlocked === null) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-3 px-5 py-16">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!requireOperator()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/verify-pin", { method: "POST", json: { pin: entry } });
      setUnlocked(true);
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
