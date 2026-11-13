"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { PAGE_STATUS, relativeTime, shortTime } from "@/lib/format";
import type { PageView } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { useOverlay } from "@/features/overlays/use-overlay";
import { usePrint } from "@/features/print/print-provider";

type Overview = {
  counts: { uploadedToday: number; printedToday: number; printedTotal: number; notPrinted: number; needsReview: number; cloudFailed: number };
  waiting: PageView[];
  recent: PageView[];
  openJobs: { id: string; kind: "UPLOAD" | "REPRINT"; operator: string; createdAt: string; readyPages: number; names: string[] }[];
};

export function DeskOverview() {
  const { data, error } = useFetch("overview", () => api<Overview>("/api/overview"));
  const overlay = useOverlay();
  const { openConfirm } = usePrint();
  const [jobSearch, setJobSearch] = React.useState("");
  const [confirmSearch, setConfirmSearch] = React.useState("");

  if (error && !data) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const c = data.counts;
  const stats = [
    { label: "Printed today", value: c.printedToday },
    { label: "Uploaded today", value: c.uploadedToday },
    { label: "Not printed yet", value: c.notPrinted },
    { label: "Printed in total", value: c.printedTotal },
  ];

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 border-y sm:grid-cols-4">
        {stats.map((s, i) => {
          const cls = i > 0 ? "border-l px-5 py-4" : "py-4 pr-5";
          // "Not printed yet" counts everything short of printed — including badges
          // already built into a sheet (below, "Built, not printed") or sent to the
          // printer. The Queue page only shows what hasn't been built into a sheet at
          // all, a narrower thing — linking there understated what this number actually
          // means, since most of it is typically already visible further down this page.
          return (
            <div key={s.label} className={cls}>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="tnum mt-1 text-2xl font-semibold tracking-[-0.02em]">{s.value}</dd>
            </div>
          );
        })}
      </dl>

      {(c.needsReview > 0 || c.cloudFailed > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {c.needsReview > 0 && (
            <a href="/records?review=yes" className="text-[oklch(0.45_0.1_65)] underline-offset-4 hover:underline">
              {pluralize(c.needsReview, "badge")} need a quick check
            </a>
          )}
          {c.cloudFailed > 0 && <CloudRetry count={c.cloudFailed} />}
        </div>
      )}

      {/* Left to right follows the actual sequence: a sheet is built, then printed and
          confirmed. Putting "Confirm" before "Built" would read backwards. */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="ready-h" className="flex flex-col gap-3">
            <SectionHead id="ready-h" title="Built, not printed" hint="Sheets already laid out — pick up where you left off." />
            {data.openJobs.length === 0 ? (
              <Empty>Nothing built and waiting. New uploads print themselves once a sheet is full.</Empty>
            ) : (
              <>
                {data.openJobs.length > 1 && (
                  <Input
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder="Find a sheet by name — someone waiting at the desk?"
                    className="h-9"
                  />
                )}
                {(() => {
                  const q = jobSearch.trim().toLowerCase();
                  const visible = q ? data.openJobs.filter((j) => j.names.some((n) => n.toLowerCase().includes(q))) : data.openJobs;
                  if (visible.length === 0) {
                    return <Empty>No waiting sheet has a name matching &ldquo;{jobSearch}&rdquo;. It may already be printed, or still in the Queue.</Empty>;
                  }
                  return (
                    <ul className="divide-y rounded-md border bg-card">
                      {visible.map((j) => {
                        const match = q ? j.names.find((n) => n.toLowerCase().includes(q)) : null;
                        const shown = match ? [match, ...j.names.filter((n) => n !== match)] : j.names;
                        return (
                          <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <span className="flex min-w-0 flex-col">
                              <span className="text-sm font-medium">
                                {j.kind === "REPRINT" ? "Reprint" : "Upload"} · {pluralize(j.readyPages, "sheet")} · {j.operator}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {match ? (
                                  <>
                                    <mark className="rounded-sm bg-[oklch(0.9_0.08_95)] px-0.5 text-foreground">{match}</mark>
                                    {shown.length > 1 ? `, ${shown.slice(1, 3).join(", ")}` : ""}
                                  </>
                                ) : shown.length > 0 ? (
                                  shown.slice(0, 3).join(", ")
                                ) : (
                                  "No badges on these sheets yet"
                                )}
                                {shown.length > 3 ? ", …" : ""}
                              </span>
                              <span className="text-xs text-muted-foreground">Started {shortTime(j.createdAt)}</span>
                            </span>
                            <Button size="sm" onClick={() => overlay.open("job", j.id)}>
                              Open
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </>
            )}
          </section>
        </div>

        <section aria-labelledby="waiting-h" className="flex flex-col gap-3">
          <SectionHead
            id="waiting-h"
            title="Confirm what printed"
            hint="Sent to the printer, but nobody's said yet whether these badges actually came out right."
          >
            {data.waiting.length > 0 && (
              <Button size="sm" onClick={() => openConfirm(data.waiting.map((p) => p.id))}>
                Confirm all {data.waiting.length}
              </Button>
            )}
          </SectionHead>
          {data.waiting.length === 0 ? (
            <Empty>Nothing to confirm. Every printed sheet&apos;s been checked against what came out.</Empty>
          ) : (
            <>
              {data.waiting.length > 1 && (
                <Input
                  value={confirmSearch}
                  onChange={(e) => setConfirmSearch(e.target.value)}
                  placeholder="Find a sheet by name — which one is theirs?"
                  className="h-9"
                />
              )}
              {(() => {
                const q = confirmSearch.trim().toLowerCase();
                const visible = q
                  ? data.waiting.filter((p) => p.items.some((i) => i.card.fullName.toLowerCase().includes(q)))
                  : data.waiting;
                if (visible.length === 0) {
                  return <Empty>No sheet waiting on confirmation has a name matching &ldquo;{confirmSearch}&rdquo;.</Empty>;
                }
                return (
                  <ul className="divide-y rounded-md border bg-card">
                    {visible.map((p) => (
                      <PageRow
                        key={p.id}
                        page={p}
                        highlight={q}
                        onOpen={() => overlay.open("page", p.id)}
                        action={
                          <Button size="sm" variant="outline" onClick={() => openConfirm([p.id])}>
                            Confirm
                          </Button>
                        }
                      />
                    ))}
                  </ul>
                );
              })()}
            </>
          )}

          <SectionHead title="Recent sheets" className="mt-6" />
          {data.recent.length === 0 ? (
            <Empty>No sheets printed yet today.</Empty>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {data.recent.map((p) => (
                <PageRow key={p.id} page={p} onOpen={() => overlay.open("page", p.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PageRow({ page, onOpen, action, highlight }: { page: PageView; onOpen: () => void; action?: React.ReactNode; highlight?: string }) {
  const st = PAGE_STATUS[page.status];
  const names = page.items.map((i) => i.card.fullName);
  const match = highlight ? names.find((n) => n.toLowerCase().includes(highlight)) : null;
  const rest = match ? names.filter((n) => n !== match) : names;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="flex items-center gap-2 text-sm font-medium">
          {page.jobKind === "REPRINT" ? "Reprint sheet" : "Sheet"} {page.pageNumber}
          <Badge variant={st.tone}>{st.label}</Badge>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {match ? (
            <>
              <mark className="rounded-sm bg-[oklch(0.9_0.08_95)] px-0.5 text-foreground">{match}</mark>
              {rest.length > 0 ? `, ${rest.join(", ")}` : ""}
            </>
          ) : (
            names.join(", ")
          )}
        </span>
      </button>
      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(page.confirmedAt ?? page.sentAt ?? page.createdAt)}</span>
      {action}
    </li>
  );
}

function SectionHead({ id, title, hint, children, className }: { id?: string; title: string; hint?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className ?? ""}`}>
      <div>
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">{children}</p>;
}

function CloudRetry({ count }: { count: number }) {
  return (
    <button
      className="text-muted-foreground underline-offset-4 hover:underline"
      onClick={async () => {
        try {
          await api("/api/cloud/retry", { method: "POST" });
          toast.message("Retrying cloud backup in the background");
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }}
    >
      {pluralize(count, "file")} not backed up to Cloudinary yet. Retry
    </button>
  );
}
