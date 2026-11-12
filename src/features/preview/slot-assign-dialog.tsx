"use client";

import * as React from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { SearchIcon } from "@/components/icons";
import { api, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { personLabel } from "@/lib/format";
import type { CardSummary } from "@/lib/types";

export type SlotTarget = { pageId: string; slot: number; current?: { fullName: string } };

/** Search the queue and drop a specific badge straight into one exact slot. */
export function SlotAssignDialog({ target, onClose, onAssigned }: { target: SlotTarget | null; onClose: () => void; onAssigned: () => void }) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (target) setQ("");
  }, [target]);

  const result = useFetch(target ? `slot-assign:${q}` : null, () => {
    const params = new URLSearchParams({ size: "20" });
    if (q) params.set("q", q);
    return api<{ rows: CardSummary[] }>(`/api/queue?${params.toString()}`);
  });
  const rows = result.data?.rows ?? [];

  async function pick(cardId: string) {
    if (!target) return;
    setBusy(cardId);
    try {
      await api("/api/pages/assign", { method: "POST", json: { pageId: target.pageId, slot: target.slot, cardId } });
      toast.success("Slot updated");
      onAssigned();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Slot {target?.slot}</DialogTitle>
          <DialogDescription>
            {target?.current ? `Replacing ${target.current.fullName}. They go back to the queue.` : "Pick a badge from the queue to fill this slot."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Search the queue…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {result.loading && !result.data ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No badges waiting in the queue match that search.</p>
            ) : (
              <ol className="divide-y rounded-md border">
                {rows.map((c) => (
                  <li key={c.id}>
                    <button
                      disabled={!!busy}
                      onClick={() => pick(c.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-60"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{personLabel(c)}</span>
                        <span className="truncate text-xs text-muted-foreground">{[c.chapter, c.district].filter(Boolean).join(" · ") || c.originalFilename}</span>
                      </span>
                      {busy === c.id && <span className="shrink-0 text-xs text-muted-foreground">Placing…</span>}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
