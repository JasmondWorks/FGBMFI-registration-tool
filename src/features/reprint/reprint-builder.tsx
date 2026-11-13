"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from "@/components/icons";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { CARD_STATUS, FILTER_STATUS_LABELS, personLabel, relativeTime } from "@/lib/format";
import { checkCount, describeCount } from "@/lib/paging";
import { serializeList } from "@/lib/records-query";
import type { CardSummary, Facets, JobView } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { BadgeList, BadgeRow } from "@/features/badges/badge-row";
import { useOperator } from "@/features/operator/operator-context";
import { useOverlay } from "@/features/overlays/use-overlay";
import { FacetFilter } from "@/features/records/facet-filter";
import { clearReprintDraft, useReprintDraft } from "./reprint-draft";

const REASONS = ["Misprint", "Lost badge", "Name corrected", "Damaged", "Collected by someone else", "Other"];
const SEARCH_SIZE = 25;

/**
 * Search and pick any number of badges, give a reason, and they're laid out 4 per sheet
 * in list order, the same way as a normal upload, with the same multiple-of-4 rule.
 */
export function ReprintBuilder({ onDone }: { onDone?: (jobId: string) => void } = {}) {
  const overlay = useOverlay();
  const { requireOperator } = useOperator();
  const [draft, setDraft] = useReprintDraft();
  const ids = draft.cardIds;
  const reason = draft.reason === undefined || draft.reason === "" ? "" : REASONS.includes(draft.reason) ? draft.reason : "Other";
  const other = reason === "Other" ? (draft.reason === "Other" ? "" : (draft.reason ?? "")) : "";
  const setIds = (fn: string[] | ((prev: string[]) => string[])) =>
    setDraft((d) => ({ ...d, cardIds: typeof fn === "function" ? fn(d.cardIds) : fn }));
  const setReason = (r: string) => setDraft((d) => ({ ...d, reason: r }));
  const setOther = (text: string) => setDraft((d) => ({ ...d, reason: text || "Other" }));
  const [busy, setBusy] = React.useState(false);
  const [fix, setFix] = React.useState<{ total: number; remainder: number; missing: number } | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const listKey = ids.join(",");
  const list = useFetch(`reprint-list:${listKey}`, () =>
    ids.length ? api<{ rows: CardSummary[] }>(`/api/cards?ids=${listKey}`).then((r) => r.rows) : Promise.resolve([] as CardSummary[]),
  );
  const cards = list.data ?? [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const count = checkCount(ids.length);
  const finalReason = reason === "Other" ? other.trim() : reason;

  function add(newIds: string[]) {
    setIds((prev) => [...prev, ...newIds.filter((id) => !prev.includes(id))]);
  }
  function remove(id: string) {
    setIds((prev) => prev.filter((x) => x !== id));
  }
  function move(id: string, delta: number) {
    setIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit(opts: { fillFromTray?: boolean; allowUnderfilled?: boolean } = {}) {
    if (!requireOperator()) return;
    if (!finalReason) {
      toast.error("Give a reason for the reprint");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ needsCountFix: boolean; total: number; remainder: number; missing: number; jobId: string | null; job?: JobView }>("/api/reprints", {
        method: "POST",
        json: { cardIds: ids, reason: finalReason, ...opts },
      });
      if (res.needsCountFix) {
        setFix({ total: res.total, remainder: res.remainder, missing: res.missing });
        return;
      }
      clearReprintDraft();
      setFix(null);
      emitDeskChanged();
      toast.success("Reprint sheets are ready");
      if (onDone) onDone(res.jobId!);
      else overlay.open("job", res.jobId!);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const [now] = React.useState(() => Date.now());
  const warnings = cards.flatMap((c) => {
    const w: string[] = [];
    if (c.status === "SUPERSEDED") w.push(`${c.fullName}: a newer badge exists. Reprint that one instead.`);
    if (c.status === "DISCARDED") w.push(`${c.fullName}: this badge was removed.`);
    if (c.printCount === 0 && c.status !== "DISCARDED") w.push(`${c.fullName}: never printed, so this will be the first print.`);
    if (c.status === "ON_PAGE" || c.status === "PRINT_SENT") w.push(`${c.fullName}: already on a sheet waiting to print.`);
    if (c.lastPrintedAt && now - new Date(c.lastPrintedAt).getTime() < 12 * 3600 * 1000 && c.printCount > 1) {
      w.push(`${c.fullName}: already reprinted ${relativeTime(c.lastPrintedAt)}.`);
    }
    return w;
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
      <SearchPanel inputRef={searchRef} picked={new Set(ids)} onAdd={add} />

      <section aria-labelledby="list-h" className="flex flex-col gap-4 self-start rounded-lg border bg-card p-5 lg:sticky lg:top-20">
        <div className="flex items-baseline justify-between">
          <h2 id="list-h" className="text-base font-semibold">
            Reprint list
          </h2>
          {ids.length > 0 && (
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setIds([])}>
              Clear list
            </button>
          )}
        </div>
        <p className={cn("tnum rounded-md px-3 py-2 text-sm", ids.length === 0 ? "bg-muted text-muted-foreground" : count.ok ? "bg-success-soft text-success" : "bg-warning-soft")}>
          {ids.length === 0 ? "Search on the left and add badges." : describeCount(count)}
          {ids.length > 0 && !count.ok && ` (add ${count.missing} or remove ${count.remainder})`}
        </p>

        {ids.length > 0 && (
          <ol className="max-h-[42vh] divide-y overflow-y-auto rounded-md border">
            {ids.map((id, i) => {
              const c = byId.get(id);
              return (
                <li key={id} className={cn("flex items-center gap-2 py-2 pr-2 pl-3", i % 4 === 0 && i > 0 && "border-t-2 border-t-foreground/15")}>
                  <span className="tnum w-12 shrink-0 text-[11px] text-muted-foreground">
                    S{Math.floor(i / 4) + 1}·{(i % 4) + 1}
                  </span>
                  {c ? (
                    <button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => overlay.open("view", id)}>
                      {personLabel(c)}
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.chapter ?? "No chapter"} · printed {c.printCount}x
                      </span>
                    </button>
                  ) : (
                    <Skeleton className="h-8 flex-1" />
                  )}
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => move(id, -1)} disabled={i === 0} aria-label="Move up">
                      <ChevronUpIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => move(id, 1)} disabled={i === ids.length - 1} aria-label="Move down">
                      <ChevronDownIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(id)} aria-label="Remove from list">
                      <CloseIcon />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-md bg-warning-soft px-3 py-2 text-xs leading-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">Reason (required)</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="reason">
              <SelectValue placeholder="Why are these being reprinted?" />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {reason === "Other" && <Textarea value={other} onChange={(e) => setOther(e.target.value)} placeholder="Describe the reason" maxLength={300} />}
        </div>

        <Button size="lg" disabled={busy || ids.length === 0 || !finalReason} onClick={() => submit()}>
          {busy ? "Laying out..." : ids.length ? `Lay out ${pluralize(Math.ceil(ids.length / 4), "sheet")}` : "Lay out sheets"}
        </Button>
      </section>

      <ReprintCountFix
        fix={fix}
        ids={ids}
        cards={byId}
        busy={busy}
        onClose={() => setFix(null)}
        onAddMore={() => {
          setFix(null);
          searchRef.current?.focus();
        }}
        onRemove={(removeIds) => {
          setIds((prev) => prev.filter((x) => !removeIds.includes(x)));
          setFix(null);
          toast.message(`${pluralize(removeIds.length, "badge")} taken off the list`);
        }}
        onTray={() => submit({ fillFromTray: true })}
        onUnderfill={() => submit({ allowUnderfilled: true })}
      />
    </div>
  );
}

function SearchPanel({ inputRef, picked, onAdd }: { inputRef: React.RefObject<HTMLInputElement | null>; picked: Set<string>; onAdd: (ids: string[]) => void }) {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [status, setStatusRaw] = React.useState<string[]>(["PRINTED"]);
  const [page, setPage] = React.useState(1);
  // Any change to the search or filters goes back to the first page of results.
  const setStatus = (v: string[]) => (setStatusRaw(v), setPage(1));

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ q: debounced, p: String(page), size: String(SEARCH_SIZE), sort: "name" });
  if (status.length) params.set("status", serializeList(status));
  const qs = params.toString();
  const results = useFetch(`reprint-search:${qs}`, () => api<{ rows: CardSummary[]; total: number }>(`/api/cards?${qs}`));
  const facets = useFetch(`reprint-facets:${qs}`, () => api<Facets>(`/api/cards/facets?${qs}`));
  const rows = results.data?.rows ?? [];
  const total = results.data?.total ?? 0;

  async function addAllMatching() {
    try {
      const { ids } = await api<{ ids: string[] }>(`/api/cards?${qs}&idsOnly=1`);
      onAdd(ids);
      toast.success(`${pluralize(ids.length, "badge")} added`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <section aria-labelledby="search-h" className="flex flex-col gap-3">
      <h2 id="search-h" className="sr-only">
        Find badges
      </h2>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <Input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, chapter, district or registration ID" className="h-10 pl-9" aria-label="Search badges" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FacetFilter
          title="Status"
          options={(facets.data?.status ?? []).map((s) => ({ ...s, label: FILTER_STATUS_LABELS[s.value] ?? s.value }))}
          selected={status}
          onChange={setStatus}
        />
        <span className="tnum ml-auto text-xs text-muted-foreground">{pluralize(total, "match", "matches")}</span>
        {total > 0 && (
          <Button size="sm" variant="outline" className="h-8" onClick={addAllMatching}>
            Add all {total}
          </Button>
        )}
      </div>

      <BadgeList>
        {results.loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-8" /></li>)}
        {!results.loading && rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No badges match.</li>}
        {rows.map((c) => {
          const inList = picked.has(c.id);
          return (
            <li key={c.id}>
              <BadgeRow
                card={c}
                selected={inList}
                onToggle={() => !inList && onAdd([c.id])}
                subtitle={`${[c.chapter, c.district].filter(Boolean).join(" · ")} · printed ${c.printCount}x${c.lastPrintedAt ? `, last ${relativeTime(c.lastPrintedAt)}` : ""}`}
                trailing={
                  <>
                    <Badge variant={CARD_STATUS[c.status].tone}>{CARD_STATUS[c.status].label}</Badge>
                    <Button size="sm" variant={inList ? "ghost" : "outline"} disabled={inList} onClick={() => onAdd([c.id])}>
                      {inList ? "Added" : "Add"}
                    </Button>
                  </>
                }
              />
            </li>
          );
        })}
      </BadgeList>
      {total > SEARCH_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="tnum text-muted-foreground">
            Page {page} of {Math.ceil(total / SEARCH_SIZE)}
          </span>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={page * SEARCH_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </section>
  );
}

function ReprintCountFix({
  fix,
  ids,
  cards,
  busy,
  onClose,
  onAddMore,
  onRemove,
  onTray,
  onUnderfill,
}: {
  fix: { total: number; remainder: number; missing: number } | null;
  ids: string[];
  cards: Map<string, CardSummary>;
  busy: boolean;
  onClose: () => void;
  onAddMore: () => void;
  onRemove: (ids: string[]) => void;
  onTray: () => void;
  onUnderfill: () => void;
}) {
  const tray = useFetch(fix ? "tray" : null, () => api<CardSummary[]>("/api/tray"));
  const [ack, setAck] = React.useState(false);
  const [seenFix, setSeenFix] = React.useState(fix);
  if (fix !== seenFix) {
    setSeenFix(fix);
    setAck(false);
  }
  if (!fix) return null;
  const count = checkCount(fix.total);
  const trayCount = (tray.data ?? []).filter((t) => !ids.includes(t.id)).length;
  const extras = ids.slice(ids.length - fix.remainder);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fix the count</DialogTitle>
          <DialogDescription>
            {describeCount(count)}. Each sheet takes exactly 4, so the last one would waste {pluralize(fix.missing, "card")}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="h-auto justify-start py-2.5 text-left" onClick={onAddMore}>
            <span className="flex flex-col items-start">
              <span>Add {fix.missing} more to the list</span>
              <span className="text-xs font-normal text-muted-foreground">Search and add badges to complete the last sheet.</span>
            </span>
          </Button>
          {trayCount >= fix.missing && (
            <Button variant="outline" className="h-auto justify-start py-2.5 text-left" disabled={busy} onClick={onTray}>
              <span className="flex flex-col items-start">
                <span>Fill the gap from the waiting tray</span>
                <span className="text-xs font-normal text-muted-foreground">{pluralize(fix.missing, "new badge")} from the tray print alongside.</span>
              </span>
            </Button>
          )}
          <Button variant="outline" className="h-auto justify-start py-2.5 text-left" onClick={() => onRemove(extras)}>
            <span className="flex flex-col items-start">
              <span>Take the last {fix.remainder} off the list</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{extras.map((id) => cards.get(id)?.fullName ?? "").join(", ")}</span>
            </span>
          </Button>
          <div className="rounded-md border p-3">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
              <span>Print anyway. {pluralize(fix.missing, "pre-printed card")} will be left blank. This is logged.</span>
            </label>
            <Button size="sm" className="mt-2" variant="secondary" disabled={!ack || busy} onClick={onUnderfill}>
              Print with a part-filled sheet
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Back to the list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
