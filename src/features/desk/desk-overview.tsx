"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  openJobs: { id: string; kind: "UPLOAD" | "REPRINT"; createdAt: string; readyPages: number }[];
};

export function DeskOverview() {
  const { data, error } = useFetch("overview", () => api<Overview>("/api/overview"));
  const overlay = useOverlay();
  const { openConfirm } = usePrint();

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
          const body = (
            <>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="tnum mt-1 text-2xl font-semibold tracking-[-0.02em] group-hover:text-primary">{s.value}</dd>
            </>
          );
          const cls = i > 0 ? "border-l px-5 py-4" : "py-4 pr-5";
          // "Not printed yet" is a count of the queue — link straight there instead of
          // repeating the same list in a second place on this page.
          return s.label === "Not printed yet" ? (
            <a key={s.label} href="/queue" className={`group ${cls} transition-colors hover:bg-accent/30`}>
              {body}
            </a>
          ) : (
            <div key={s.label} className={cls}>
              {body}
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
              <ul className="divide-y rounded-md border bg-card">
                {data.openJobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">
                        {j.kind === "REPRINT" ? "Reprint" : "Upload"} · {pluralize(j.readyPages, "sheet")}
                      </span>
                      <span className="text-xs text-muted-foreground">Started {shortTime(j.createdAt)}</span>
                    </span>
                    <Button size="sm" onClick={() => overlay.open("job", j.id)}>
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
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
            <Empty>Nothing to confirm. Every printed sheet's been checked against what came out.</Empty>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {data.waiting.map((p) => (
                <PageRow key={p.id} page={p} onOpen={() => overlay.open("page", p.id)} action={<Button size="sm" variant="outline" onClick={() => openConfirm([p.id])}>Confirm</Button>} />
              ))}
            </ul>
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

function PageRow({ page, onOpen, action }: { page: PageView; onOpen: () => void; action?: React.ReactNode }) {
  const st = PAGE_STATUS[page.status];
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="flex items-center gap-2 text-sm font-medium">
          {page.jobKind === "REPRINT" ? "Reprint sheet" : "Sheet"} {page.pageNumber}
          <Badge variant={st.tone}>{st.label}</Badge>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {page.items.map((i) => i.card.fullName).join(", ")}
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
