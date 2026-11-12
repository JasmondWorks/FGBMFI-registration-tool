"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { CARD_STATUS, PAGE_STATUS, personLabel, shortTime } from "@/lib/format";
import type { JobView, PageView } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, MoreIcon } from "@/components/icons";
import { IntakeProgress, useIntakeContext } from "@/features/intake/intake-provider";
import { useOverlay } from "@/features/overlays/use-overlay";
import { usePrint } from "@/features/print/print-provider";
import { CountFixDialog, type LayoutBase } from "./count-fix-dialog";
import { SheetView } from "./sheet-view";
import { SlotEditor } from "./slot-editor";

type PageFilter = "all" | "ready" | "waiting" | "done";

/**
 * The print preview for one upload or reprint: every sheet of 4, true to scale over the
 * card template. Print one sheet or all ready sheets; rearrange and fix details first.
 */
export function JobPreview() {
  const overlay = useOverlay();
  const jobId = overlay.job;
  const { data: fetched, error, reload } = useFetch(jobId ? `job:${jobId}` : null, () => api<JobView>(`/api/jobs/${jobId}`));
  const job = fetched && fetched.id === jobId ? fetched : null;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [slot, setSlot] = React.useState<number | null>(1);
  const [filter, setFilter] = React.useState<PageFilter>("all");
  const [fix, setFix] = React.useState<{ base: LayoutBase } | null>(null);
  const [showTemplate, setShowTemplate] = React.useState(true);
  const [fixDismissedFor, setFixDismissedFor] = React.useState<string | null>(null);
  const { printPages, phase, settings, openConfirm } = usePrint();
  const intake = useIntakeContext();

  // A different job: start from its first sheet.
  const [shownJobId, setShownJobId] = React.useState(jobId);
  if (jobId !== shownJobId) {
    setShownJobId(jobId);
    setSelectedId(null);
    setSlot(1);
    setFilter("all");
    setFix(null);
  }

  const pages = job?.pages ?? [];
  const readyPages = pages.filter((p) => p.status === "READY");
  // A page short of 4 that isn't an explicit, logged "print anyway" override is never
  // printable — regardless of upload, reprint, or queue-built job — so this has to block
  // the print action itself, not just surface as a server error after the click.
  const hasIncompletePage = readyPages.some((p) => p.items.length !== 4 && !p.isUnderfilled);
  const blocked = (job?.unplaced.length ?? 0) > 0 || hasIncompletePage;

  // "Fix the count" opens by itself when a job has badges left over, until dismissed.
  const autoFix = !!job && blocked && fixDismissedFor !== job.id && intake.state.phase === "idle";
  const fixState = fix ?? (autoFix ? { base: {} } : null);

  const visiblePages = pages.filter((p) =>
    filter === "all" ? true : filter === "ready" ? p.status === "READY" : filter === "waiting" ? p.status === "SENT" || p.status === "SPOOLED" : ["CONFIRMED", "PARTIAL", "CANCELLED"].includes(p.status),
  );
  const selected = pages.find((p) => p.id === selectedId) ?? visiblePages[0] ?? pages[0] ?? null;
  const waitingPages = pages.filter((p) => p.status === "SENT" || p.status === "SPOOLED");
  const badgeCount = pages.reduce((n, p) => n + p.items.length, 0);
  const printing = phase.kind !== "idle";

  const index = selected ? pages.findIndex((p) => p.id === selected.id) : -1;
  const go = (delta: number) => {
    const next = pages[index + delta];
    if (next) {
      setSelectedId(next.id);
      setSlot(1);
    }
  };

  async function relayout(base: LayoutBase) {
    if (!job) return;
    try {
      const res = await api<{ ok: boolean; job: JobView }>(`/api/jobs/${job.id}/layout`, { method: "POST", json: base });
      emitDeskChanged();
      if (!res.ok) {
        setFix({ base });
        return;
      }
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function swap(page: PageView, fromSlot: number, toPageId: string, toSlot: number) {
    try {
      await api("/api/pages/swap", { method: "POST", json: { a: { pageId: page.id, slot: fromSlot }, b: { pageId: toPageId, slot: toSlot } } });
      await reload();
      toast.success("Badges swapped");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function printAll() {
    if (blocked) return setFix({ base: {} });
    const cards = readyPages.reduce((n, p) => n + p.items.length, 0);
    if (readyPages.length > 1 && settings.printMode === "BROWSER") {
      // Multiple sheets in one browser print job: if the printer's own default is
      // double-sided, sheet 2 prints on the BACK of sheet 1's single-sided pre-printed
      // stock instead of a fresh sheet. The app can't change that setting for you — the
      // system print dialog that's about to open is the only place to do it.
      const ok = window.confirm(
        `Print ${pluralize(readyPages.length, "sheet")} (${pluralize(cards, "card")})?\n\n` +
          `IMPORTANT: in the print dialog that opens next, make sure "Two-sided" / "Duplex" is OFF ` +
          `(set to one-sided / simplex). These cards are pre-printed on one side only — if duplex is ` +
          `on, sheet 2 will print on the back of sheet 1 instead of its own sheet.`,
      );
      if (!ok) return;
    }
    void printPages(readyPages.map((p) => p.id));
  }

  const title = job ? (job.kind === "REPRINT" ? `Reprint: ${job.reason ?? "no reason"}` : `Upload by ${job.operator}`) : "Print preview";

  return (
    <Dialog open={!!jobId} onOpenChange={(o) => !o && overlay.close("job")}>
      <DialogContent className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[1480px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1480px]">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3 pr-14">
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="truncate text-base">{title}</DialogTitle>
            <DialogDescription className="tnum text-xs">
              {job ? `${pluralize(badgeCount, "badge")} on ${pluralize(pages.length, "sheet")} · started ${shortTime(job.createdAt)}` : "Loading"}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1" role="tablist" aria-label="Filter sheets">
            {(
              [
                ["all", "All", pages.length],
                ["ready", "Ready", readyPages.length],
                ["waiting", "Awaiting check", waitingPages.length],
                ["done", "Done", pages.length - readyPages.length - waitingPages.length],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs font-medium focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                  filter === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {label} <span className="tnum opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {waitingPages.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => openConfirm(waitingPages.map((p) => p.id))}>
                Confirm {pluralize(waitingPages.length, "sheet")}
              </Button>
            )}
            <Button onClick={printAll} disabled={printing || (readyPages.length === 0 && !blocked)}>
              {phase.kind === "preparing" ? "Preparing..." : `Print all ready (${readyPages.length})`}
            </Button>
          </div>
        </header>

        {blocked && job && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-warning-soft px-5 py-2.5 text-sm">
            <span>
              <strong className="font-semibold">{pluralize(job.unplaced.length, "badge")}</strong> {job.unplaced.length === 1 ? "isn't" : "aren't"} on a sheet yet. Every sheet needs exactly 4.
            </span>
            <Button size="sm" variant="outline" onClick={() => setFix({ base: {} })}>
              Fix the count
            </Button>
          </div>
        )}
        {intake.state.phase !== "idle" && (
          <div className="border-b px-5 py-3">
            <IntakeProgress />
          </div>
        )}

        {error && <p className="p-6 text-sm text-destructive">{error}</p>}
        {!job && !error && (
          <div className="grid flex-1 grid-cols-[220px_1fr_340px] gap-6 p-6">
            <Skeleton className="h-full" />
            <Skeleton className="mx-auto aspect-[210/297] h-full" />
            <Skeleton className="h-full" />
          </div>
        )}

        {job && (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_360px]">
            {/* Sheet list */}
            <nav aria-label="Sheets" className="min-h-0 overflow-y-auto border-r bg-muted/30">
              {visiblePages.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">{pages.length === 0 ? "No sheets yet." : "No sheets match this filter."}</p>
              )}
              <ol>
                {visiblePages.map((p) => {
                  const st = PAGE_STATUS[p.status];
                  const active = selected?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => {
                          setSelectedId(p.id);
                          setSlot(1);
                        }}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex w-full flex-col gap-1.5 border-b px-4 py-3 text-left transition-colors focus-visible:bg-accent focus-visible:outline-none",
                          active ? "bg-card shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-card/70",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="tnum text-sm font-semibold">Sheet {p.pageNumber}</span>
                          <Badge variant={st.tone}>{st.label}</Badge>
                        </span>
                        <span className="flex flex-col text-xs leading-5 text-muted-foreground">
                          {p.items.map((i) => (
                            <span key={i.itemId} className={cn("truncate", i.printed === false && "text-destructive line-through")}>
                              {i.card.fullName}
                            </span>
                          ))}
                          {p.isUnderfilled && <span className="text-[oklch(0.45_0.1_65)]">Part-filled sheet</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Sheet */}
            <section className="flex min-h-0 flex-col items-center gap-3 overflow-y-auto bg-[oklch(0.94_0.008_80)] px-6 py-5">
              {selected ? (
                <>
                  <div className="flex w-full max-w-[560px] items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} disabled={index <= 0} aria-label="Previous sheet">
                        <ChevronLeftIcon />
                      </Button>
                      <span className="tnum text-sm">
                        Sheet {selected.pageNumber} <span className="text-muted-foreground">of {pages.length}</span>
                      </span>
                      <Button variant="ghost" size="icon-sm" onClick={() => go(1)} disabled={index >= pages.length - 1} aria-label="Next sheet">
                        <ChevronRightIcon />
                      </Button>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={showTemplate} onChange={(e) => setShowTemplate(e.target.checked)} className="accent-[var(--primary)]" />
                      Show card template
                    </label>
                  </div>
                  <div className="w-full max-w-[560px]" style={{ maxWidth: "min(560px, calc((100dvh - 15rem) * 210 / 297))" }}>
                    <SheetView
                      items={selected.items.map((i) => ({ slot: i.slot, card: i.card, printed: i.printed }))}
                      showTemplate={showTemplate}
                      offsetXmm={settings.offsetXmm}
                      offsetYmm={settings.offsetYmm}
                      offsetYmmRow2={settings.offsetYmmRow2}
                      renderWidth={560}
                      selectedSlot={slot}
                      onSlotClick={setSlot}
                    />
                  </div>
                  <div className="flex w-full max-w-[560px] flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {selected.status === "READY" && selected.items.length !== 4 && !selected.isUnderfilled
                        ? `${selected.items.length} of 4 slots filled — printing is blocked until this sheet is complete.`
                        : settings.printMode === "DIRECT"
                          ? `Prints directly to ${settings.printerName ?? "the chosen printer"} at actual size.`
                          : "In the print dialog choose A4 and Actual size (100%). Never Fit to page."}
                    </p>
                    {selected.status === "READY" && selected.items.length !== 4 && !selected.isUnderfilled ? (
                      <Button variant="outline" onClick={() => setFix({ base: {} })}>
                        Fix this sheet to print it
                      </Button>
                    ) : selected.status === "READY" ? (
                      <Button variant="outline" onClick={() => printPages([selected.id])} disabled={printing}>
                        Print this sheet
                      </Button>
                    ) : selected.status === "SENT" || selected.status === "SPOOLED" ? (
                      <Button variant="outline" onClick={() => openConfirm([selected.id])}>
                        Confirm this sheet
                      </Button>
                    ) : (
                      <Badge variant={PAGE_STATUS[selected.status].tone}>
                        {PAGE_STATUS[selected.status].label} {selected.confirmedAt ? shortTime(selected.confirmedAt) : ""}
                      </Badge>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  {blocked ? "Fix the count to lay out the sheets." : "Nothing to show."}
                </div>
              )}
            </section>

            {/* Slots */}
            <aside className="hidden min-h-0 flex-col overflow-y-auto border-l xl:flex">
              {selected ? (
                <ol className="divide-y">
                  {[1, 2, 3, 4].map((n) => {
                    const item = selected.items.find((i) => i.slot === n);
                    const isOpen = slot === n;
                    if (!item) {
                      return (
                        <li key={n} className="px-4 py-3 text-xs text-muted-foreground">
                          Slot {n} is empty
                        </li>
                      );
                    }
                    const editable = selected.status === "READY";
                    const otherSlots = pages
                      .filter((p) => p.status === "READY")
                      .flatMap((p) => p.items.filter((i) => !(p.id === selected.id && i.slot === n)).map((i) => ({ page: p, item: i })));
                    return (
                      <li key={n} className={cn(isOpen && "bg-accent/30")}>
                        <div className="flex items-center gap-2 px-4 pt-3">
                          <button onClick={() => setSlot(isOpen ? null : n)} className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none" aria-expanded={isOpen}>
                            <span className="tnum flex size-5 shrink-0 items-center justify-center rounded-sm bg-foreground/85 text-[10px] font-medium text-background">{n}</span>
                            <span className="truncate text-sm font-medium">{personLabel(item.card)}</span>
                          </button>
                          {item.card.needsReview && <Badge variant="warning">Check</Badge>}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.card.fullName}`}>
                                <MoreIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-h-80 w-64 overflow-y-auto">
                              <DropdownMenuItem onSelect={() => overlay.open("view", item.card.id)}>Open badge</DropdownMenuItem>
                              {editable && (
                                <>
                                  {job.kind === "UPLOAD" && item.card.printCount === 0 && (
                                    <DropdownMenuItem onSelect={() => relayout({ holdCardIds: [item.card.id] })}>Hold in waiting tray</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem variant="destructive" onSelect={() => relayout({ removeCardIds: [item.card.id] })}>
                                    {job.kind === "UPLOAD" && item.card.printCount === 0 ? "Remove badge" : "Take out of this print"}
                                  </DropdownMenuItem>
                                  {otherSlots.length > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuLabel>Swap with</DropdownMenuLabel>
                                      {otherSlots.slice(0, 40).map(({ page, item: other }) => (
                                        <DropdownMenuItem key={other.itemId} onSelect={() => swap(selected, n, page.id, other.slot)}>
                                          <span className="tnum text-xs text-muted-foreground">
                                            S{page.pageNumber}·{other.slot}
                                          </span>
                                          <span className="truncate">{other.card.fullName}</span>
                                        </DropdownMenuItem>
                                      ))}
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="truncate px-4 pt-0.5 pb-3 pl-11 text-xs text-muted-foreground">
                          {[item.card.chapter, item.card.district].filter(Boolean).join(" · ") || "No chapter"} ·{" "}
                          {CARD_STATUS[item.card.status].label}
                          {item.card.printCount > 0 ? ` ${item.card.printCount}x` : ""}
                        </p>
                        {isOpen && (
                          <div className="px-4 pb-4 pl-11">
                            <SlotEditor card={item.card} onSaved={() => reload()} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="p-4 text-xs text-muted-foreground">Select a sheet.</p>
              )}
            </aside>
          </div>
        )}

        {job && fixState && (
          <CountFixDialog
            open
            job={job}
            base={fixState.base}
            onClose={() => {
              setFix(null);
              setFixDismissedFor(job.id);
            }}
            onLaidOut={() => {
              setSelectedId(null);
              void reload();
            }}
            onAddFiles={() => setFix(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
