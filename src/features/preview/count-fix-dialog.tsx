"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { personLabel } from "@/lib/format";
import { checkCount, describeCount } from "@/lib/paging";
import type { CardSummary, JobView } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { useIntakeContext } from "@/features/intake/intake-provider";

export type LayoutBase = { removeCardIds?: string[]; holdCardIds?: string[]; addCardIds?: string[] };

type Choice = "hold" | "remove" | "add" | "queue" | "underfill";

/**
 * Every sheet holds 4 badges, so the total must be a multiple of 4 to avoid wasting
 * pre-printed card stock. This dialog offers the ways to get there.
 */
export function CountFixDialog({
  open,
  job,
  base,
  onClose,
  onLaidOut,
  onAddFiles,
}: {
  open: boolean;
  job: JobView;
  base: LayoutBase;
  onClose: () => void;
  onLaidOut: (job: JobView) => void;
  /** Closes without dismissing, so the check comes back after the new files are in. */
  onAddFiles: () => void;
}) {
  const intake = useIntakeContext();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const isUpload = job.kind === "UPLOAD";

  const removed = new Set(base.removeCardIds ?? []);
  const queue: CardSummary[] = [
    ...job.pages.filter((p) => p.status === "READY").flatMap((p) => p.items.map((i) => i.card)),
    ...job.unplaced,
  ].filter((c) => !removed.has(c.id));
  const count = checkCount(queue.length);

  // The whole queue, not just the (now largely vestigial) waiting tray subset — any badge
  // uploaded anywhere that hasn't printed yet can fill the gap on this sheet.
  const queueFetch = useFetch(open ? "queue-available" : null, () => api<{ rows: CardSummary[] }>("/api/queue?size=200"));
  const queueAvailable = (queueFetch.data?.rows ?? []).filter((t) => !queue.some((q) => q.id === t.id));

  const defaultChoice: Choice = isUpload ? "hold" : queueAvailable.length >= count.missing ? "queue" : "remove";
  const [choice, setChoice] = React.useState<Choice>(defaultChoice);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Each time the dialog opens for a job, pre-select the extras: the badges that would land
  // on the part-filled last sheet.
  const resetKey = `${open}:${job.id}:${queue.length}`;
  const [lastReset, setLastReset] = React.useState("");
  if (open && resetKey !== lastReset) {
    setLastReset(resetKey);
    setChoice(defaultChoice);
    setAck(false);
    setPicked(new Set(queue.slice(queue.length - count.remainder).map((c) => c.id)));
  }

  const after = queue.length - picked.size;
  // Holding or removing everything left over (0 to print) is fine; otherwise whole sheets only.
  const pickValid = picked.size > 0 && after % 4 === 0;

  async function layout(extra: LayoutBase & { allowUnderfilled?: boolean }) {
    setBusy(true);
    try {
      const body = {
        removeCardIds: [...(base.removeCardIds ?? []), ...(extra.removeCardIds ?? [])],
        holdCardIds: [...(base.holdCardIds ?? []), ...(extra.holdCardIds ?? [])],
        addCardIds: [...(base.addCardIds ?? []), ...(extra.addCardIds ?? [])],
        allowUnderfilled: extra.allowUnderfilled,
      };
      const res = await api<{ ok: boolean; job: JobView; remainder?: number }>(`/api/jobs/${job.id}/layout`, { method: "POST", json: body });
      emitDeskChanged();
      if (!res.ok) {
        toast.error(`Still ${pluralize(res.remainder ?? 0, "badge")} over. Pick a different number.`);
        return;
      }
      onLaidOut(res.job);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (choice === "hold") return layout({ holdCardIds: [...picked] });
    if (choice === "remove") return layout({ removeCardIds: [...picked] });
    if (choice === "queue") return layout({ addCardIds: queueAvailable.slice(0, count.missing).map((t) => t.id) });
    if (choice === "underfill") return layout({ allowUnderfilled: true });
    if (choice === "add") fileInput.current?.click();
  }

  const options: { id: Choice; title: string; detail: string; show: boolean }[] = [
    {
      id: "hold",
      title: `Hold ${pluralize(count.remainder, "badge")} for the next upload`,
      detail: "They wait in the tray and go first on the next upload's sheets.",
      show: isUpload,
    },
    {
      id: "add",
      title: `Upload ${count.missing} more ${count.missing === 1 ? "file" : "files"} from this device`,
      detail: "Pick more badge files to complete the last sheet.",
      show: isUpload && !base.removeCardIds?.length,
    },
    {
      id: "queue",
      title: `Add ${pluralize(count.missing, "badge")} from the queue`,
      detail: `${pluralize(Math.min(queueAvailable.length, count.missing), "badge")} already waiting elsewhere will join this ${isUpload ? "upload" : "reprint"}.`,
      show: queueAvailable.length >= count.missing && count.missing > 0,
    },
    {
      id: "remove",
      title: isUpload ? `Remove ${pluralize(count.remainder, "badge")}` : `Take ${pluralize(count.remainder, "badge")} out of this reprint`,
      detail: isUpload ? "Removed badges stay in the records as removed." : "They keep their printed status.",
      show: true,
    },
    {
      id: "underfill",
      title: "Print anyway with a part-filled sheet",
      detail: `${pluralize(count.missing, "card")} on the last sheet will be wasted. This is logged.`,
      show: true,
    },
  ];

  const needsPick = choice === "hold" || choice === "remove";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Fix the count</DialogTitle>
          <DialogDescription>
            {describeCount(count)}. Each sheet takes exactly 4, so the last one would waste {pluralize(count.missing, "card")}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">How to fix the count</legend>
            {options
              .filter((o) => o.show)
              .map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    choice === o.id ? "border-primary bg-accent/50" : "hover:bg-muted/60",
                  )}
                >
                  <input
                    type="radio"
                    name="fix"
                    className="mt-1 accent-[var(--primary)]"
                    checked={choice === o.id}
                    onChange={() => setChoice(o.id)}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{o.title}</span>
                    <span className="text-xs text-muted-foreground">{o.detail}</span>
                  </span>
                </label>
              ))}
          </fieldset>

          {needsPick && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Choose which</span>
                <span className={cn("tnum text-xs", pickValid ? "text-success" : "text-muted-foreground")}>
                  {picked.size} chosen · {after} left = {after === 0 ? "nothing left to print" : after % 4 === 0 ? pluralize(after / 4, "full sheet") : "not a multiple of 4"}
                </span>
              </div>
              <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">
                {[...queue].reverse().map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                      <Checkbox
                        checked={picked.has(c.id)}
                        onCheckedChange={(v) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{personLabel(c)}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.chapter}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {choice === "underfill" && (
            <label className="mt-4 flex items-start gap-3 rounded-md bg-warning-soft px-3 py-2.5 text-sm">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
              <span>I understand {pluralize(count.missing, "pre-printed card")} will be left blank.</span>
            </label>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Decide later
          </Button>
          <Button
            onClick={apply}
            disabled={busy || (needsPick && !pickValid) || (choice === "underfill" && !ack)}
          >
            {choice === "add" ? "Choose files" : busy ? "Updating..." : "Apply"}
          </Button>
        </DialogFooter>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) {
              onAddFiles();
              void intake.start(files, job.id);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
