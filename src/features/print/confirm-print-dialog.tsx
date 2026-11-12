"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { personLabel } from "@/lib/format";
import type { PageView } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { setReprintDraft } from "@/features/reprint/reprint-draft";

/**
 * "Did these print correctly?" Everything starts ticked; the operator unticks badges that
 * jammed or came out wrong. This answer is what marks badges as printed.
 */
export function ConfirmPrintDialog({ pageIds, onClose }: { pageIds: string[] | null; onClose: () => void }) {
  const router = useRouter();
  const key = pageIds?.join(",") ?? null;
  const fetched = useFetch(key ? `confirm:${key}` : null, () => api<{ pages: PageView[] }>(`/api/pages?ids=${key}`));
  const pages = React.useMemo(
    () => (pageIds && fetched.data ? fetched.data.pages.filter((p) => p.status === "SENT" || p.status === "SPOOLED") : null),
    [pageIds, fetched.data],
  );
  const error = fetched.error;
  const [printed, setPrinted] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  // Everything starts ticked whenever a new set of sheets loads.
  const [ticked, setTicked] = React.useState<PageView[] | null>(null);
  if (pages && pages !== ticked) {
    setTicked(pages);
    setPrinted(new Set(pages.flatMap((p) => p.items.map((i) => i.itemId))));
  }

  const allItems = pages?.flatMap((p) => p.items) ?? [];
  const failed = allItems.filter((i) => !printed.has(i.itemId));

  function toggle(itemId: string, on: boolean) {
    setPrinted((prev) => {
      const next = new Set(prev);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }
  function togglePage(page: PageView, on: boolean) {
    setPrinted((prev) => {
      const next = new Set(prev);
      for (const i of page.items) {
        if (on) next.add(i.itemId);
        else next.delete(i.itemId);
      }
      return next;
    });
  }

  async function save(thenReprint: boolean) {
    if (!pages) return;
    setBusy(true);
    try {
      await api("/api/print/confirm", {
        method: "POST",
        json: {
          pages: pages.map((p) => ({
            pageId: p.id,
            printedItemIds: p.items.filter((i) => printed.has(i.itemId)).map((i) => i.itemId),
            failedItemIds: p.items.filter((i) => !printed.has(i.itemId)).map((i) => i.itemId),
          })),
        },
      });
      emitDeskChanged();
      const ok = allItems.length - failed.length;
      toast.success(`${pluralize(ok, "badge")} saved to the printed list`);
      if (thenReprint && failed.length) {
        setReprintDraft({ cardIds: failed.map((f) => f.card.id), reason: "Misprint" });
        router.push("/reprint");
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function nothingPrinted() {
    if (!pages) return;
    setBusy(true);
    try {
      await api("/api/print/cancel", { method: "POST", json: { pageIds: pages.map((p) => p.id) } });
      emitDeskChanged();
      toast.message("The sheets are ready to print again");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!pageIds} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex max-h-[min(760px,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-2xl" showCloseButton={!busy}>
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Did these print correctly?</DialogTitle>
          <DialogDescription>
            Untick any badge that jammed, smudged or came out misaligned. Only ticked badges go on the printed list.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!pages && !error && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          )}
          {pages && pages.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">These sheets have already been confirmed.</p>
          )}
          <div className="flex flex-col gap-4">
            {pages?.map((page) => {
              const pagePrinted = page.items.filter((i) => printed.has(i.itemId)).length;
              const whole = pagePrinted === 0;
              return (
                <section key={page.id} className="rounded-md border">
                  <header className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
                    <span className="text-sm font-medium">
                      {page.jobKind === "REPRINT" ? "Reprint sheet" : "Sheet"} {page.pageNumber}
                    </span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox checked={whole} onCheckedChange={(v) => togglePage(page, !v)} />
                      Whole sheet failed
                    </label>
                  </header>
                  <ul className="grid grid-cols-1 sm:grid-cols-2">
                    {page.items.map((item) => {
                      const on = printed.has(item.itemId);
                      return (
                        <li key={item.itemId} className="border-b last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:odd:border-r">
                          <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5", !on && "bg-danger-soft/60")}>
                            <Checkbox checked={on} onCheckedChange={(v) => toggle(item.itemId, !!v)} />
                            <span className="flex min-w-0 flex-col">
                              <span className={cn("truncate text-sm", !on && "text-destructive line-through decoration-1")}>
                                {personLabel(item.card)}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                Slot {item.slot} · {item.card.chapter ?? "No chapter"}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
          <Button variant="ghost" onClick={nothingPrinted} disabled={busy || !pages?.length}>
            Nothing printed
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {failed.length > 0 && (
              <Button variant="outline" onClick={() => save(true)} disabled={busy}>
                Save and reprint {failed.length} failed
              </Button>
            )}
            <Button onClick={() => save(false)} disabled={busy || !pages?.length}>
              Save to printed list
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
