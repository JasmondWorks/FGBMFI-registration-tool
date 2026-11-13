"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { SearchIcon } from "@/components/icons";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { relativeTime } from "@/lib/format";
import { CARDS_PER_PAGE, checkCount, describeCount } from "@/lib/paging";
import type { CardSummary, JobView } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { BadgeList, BadgeRow } from "@/features/badges/badge-row";
import { useOperator } from "@/features/operator/operator-context";
import { useOverlay } from "@/features/overlays/use-overlay";

type QueueResponse = { rows: CardSummary[]; total: number };

/**
 * Every badge uploaded anywhere that hasn't been placed on a page yet, across every
 * upload. Printing here means pulling from the queue (default order, or any 4 picked
 * by hand) instead of each upload immediately turning into pages.
 */
export function QueueView() {
  const overlay = useOverlay();
  const { requireOperator } = useOperator();
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const queryKey = `queue:${q}`;
  const result = useFetch(queryKey, () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("size", "100");
    return api<QueueResponse>(`/api/queue?${params.toString()}`);
  });

  const rows = result.data?.rows ?? [];
  const total = result.data?.total ?? 0;
  // A selected badge can leave the queue on its own (printed via another tab, swept up by
  // an upload's auto-build, etc). Filtering against the current rows here — rather than
  // pruning the `selected` Set itself — means "N selected" never claims more than what's
  // actually still there, without needing an effect just to keep state in sync with props.
  const selectedRows = rows.filter((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function printSelected(allowUnderfilled = false) {
    if (!requireOperator()) return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; needsCountFix?: boolean; missing?: number; jobId?: string | null; job?: JobView }>(
        "/api/queue/build",
        { method: "POST", json: { cardIds: selectedRows.map((r) => r.id), allowUnderfilled } },
      );
      if (res.needsCountFix) {
        // A deliberately hand-picked list (e.g. specific priority names from a search)
        // doesn't need the usual "round up to 4" friction — offer to just print the last
        // sheet with empty slots instead of blocking.
        const ok = window.confirm(
          `${selectedRows.length} badges picked — the last sheet will have ${res.missing} blank slot${res.missing === 1 ? "" : "s"}. Print it anyway?`,
        );
        if (ok) return printSelected(true);
        toast.message("Not printed", { description: "Add or remove a badge to make it a multiple of 4, or try again to print underfilled." });
        return;
      }
      setSelected(new Set());
      emitDeskChanged();
      toast.success("Sheet is ready");
      overlay.open("job", res.jobId!);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function buildNext() {
    if (!requireOperator()) return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; needsCountFix?: boolean; jobId?: string | null; job?: JobView }>("/api/queue/build", {
        method: "POST",
        json: { allowUnderfilled: true },
      });
      emitDeskChanged();
      if (res.jobId) {
        toast.success("Next sheet is ready");
        overlay.open("job", res.jobId);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function moveToTop() {
    if (selectedRows.length === 0) return;
    if (!requireOperator()) return;
    try {
      await api("/api/queue/reorder", { method: "POST", json: { orderedIds: selectedRows.map((r) => r.id) } });
      setSelected(new Set());
      emitDeskChanged();
      // Prioritizing isn't a separate step from printing: if that was enough to complete
      // a sheet, it goes straight to the printer like a fresh upload would.
      const built = await api<{ built: boolean; ok?: boolean; job?: JobView }>("/api/queue/build-all", { method: "POST", json: {} });
      if (built.built && built.ok && built.job) {
        toast.success("Prioritized — sheet is ready");
        overlay.open("job", built.job.id);
      } else {
        toast.success(`${pluralize(selectedRows.length, "badge")} moved to the front of the queue`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Print queue</h1>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Nothing waiting."
              : total % CARDS_PER_PAGE === 0
                ? `${pluralize(total, "badge")} waiting — sheets build and print themselves automatically.`
                : `${pluralize(total, "badge")} waiting — ${CARDS_PER_PAGE - (total % CARDS_PER_PAGE)} more needed before the next sheet builds itself.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => buildNext()} disabled={busy || total === 0}>
            Build next sheet ({Math.min(CARDS_PER_PAGE, total)})
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search the queue…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
          <span className="text-sm font-medium">{pluralize(selectedRows.length, "selected")}</span>
          <span className={cn("tnum text-xs", checkCount(selectedRows.length).ok ? "text-success" : "text-warning")}>
            {describeCount(checkCount(selectedRows.length))}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={moveToTop}>
              Move to front
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => printSelected()} disabled={busy}>
              Print selected now
            </Button>
          </div>
        </div>
      )}

      {result.loading && !result.data ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {total === 0 ? "The queue is empty. Uploads land here automatically." : "No badges match this search."}
        </div>
      ) : (
        <BadgeList as="ol">
          {rows.map((c, i) => (
            <li key={c.id}>
              <BadgeRow
                card={c}
                index={i + 1}
                selected={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
                onClick={() => overlay.open("view", c.id)}
                trailing={
                  <>
                    {c.needsReview && <Badge variant="warning">Check</Badge>}
                    {c.status === "WAITING_TRAY" && <Badge variant="outline">Tray</Badge>}
                    <span className="tnum shrink-0 text-xs text-muted-foreground">{relativeTime(c.createdAt)}</span>
                  </>
                }
              />
            </li>
          ))}
        </BadgeList>
      )}
      {selectedRows.length === 0 && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Search and select any badges: &ldquo;Move to front&rdquo; prioritizes them and prints right away if that completes a
          sheet, or &ldquo;Print selected now&rdquo; to print exactly that pick immediately regardless of order.
        </p>
      )}
    </div>
  );
}
