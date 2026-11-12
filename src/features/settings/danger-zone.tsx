"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged } from "@/lib/events";
import { useOperator } from "@/features/operator/operator-context";

const PHRASE = "DELETE EVERYTHING";

/** Wipes all test data: every badge, page, job and audit event, gone for good. */
export function DangerZone() {
  const { requireOperator } = useOperator();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function reset() {
    if (!requireOperator() || text !== PHRASE) return;
    setBusy(true);
    try {
      await api("/api/admin/reset", { method: "POST", json: { confirm: text } });
      emitDeskChanged();
      toast.success("Everything's cleared. Starting fresh.");
      setText("");
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
      <div>
        <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Clears every badge, sheet, upload and audit record on this desk. Use this to wipe out test data before the real event —
          never once real badges are being tracked. This can't be undone.
        </p>
      </div>
      {!open ? (
        <Button variant="outline" className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
          Clear all data…
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-confirm">
              Type <span className="tnum font-mono">{PHRASE}</span> to confirm
            </Label>
            <Input id="reset-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className="max-w-sm" />
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" disabled={text !== PHRASE || busy} onClick={reset}>
              {busy ? "Clearing..." : "Clear everything"}
            </Button>
            <Button variant="ghost" onClick={() => (setOpen(false), setText(""))}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
