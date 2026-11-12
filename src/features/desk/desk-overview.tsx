"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { PAGE_STATUS, personLabel, relativeTime, shortTime } from "@/lib/format";
import type { CardSummary, PageView } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { useOverlay } from "@/features/overlays/use-overlay";
import { usePrint } from "@/features/print/print-provider";

type Overview = {
  counts: { uploadedToday: number; printedToday: number; printedTotal: number; notPrinted: number; needsReview: number; cloudFailed: number };
  waiting: PageView[];
  recent: PageView[];
  openJobs: { id: string; kind: "UPLOAD" | "REPRINT"; createdAt: string; readyPages: number }[];
  unplacedJobs: { id: string; count: number }[];
  tray: CardSummary[];
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
        {stats.map((s, i) => (
          <div key={s.label} className={i > 0 ? "border-l px-5 py-4" : "py-4 pr-5"}>
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="tnum mt-1 text-2xl font-semibold tracking-[-0.02em]">{s.value}</dd>
          </div>
        ))}
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

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="waiting-h" className="flex flex-col gap-3">
          <SectionHead id="waiting-h" title="Waiting for your check" hint="Sheets sent to the printer that nobody has confirmed yet.">
            {data.waiting.length > 0 && (
              <Button size="sm" onClick={() => openConfirm(data.waiting.map((p) => p.id))}>
                Check all {data.waiting.length}
              </Button>
            )}
          </SectionHead>
          {data.waiting.length === 0 ? (
            <Empty>Nothing waiting. Every printed sheet has been checked.</Empty>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {data.waiting.map((p) => (
                <PageRow key={p.id} page={p} onOpen={() => overlay.open("page", p.id)} action={<Button size="sm" variant="outline" onClick={() => openConfirm([p.id])}>Check</Button>} />
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

        <div className="flex flex-col gap-8">
          <section aria-labelledby="ready-h" className="flex flex-col gap-3">
            <SectionHead id="ready-h" title="Ready to print" hint="Uploads and reprints with sheets not printed yet." />
            {data.openJobs.length === 0 && data.unplacedJobs.length === 0 ? (
              <Empty>No sheets waiting to print.</Empty>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {data.unplacedJobs.map((j) => (
                  <li key={`u-${j.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm">
                      <span className="font-medium">{pluralize(j.count, "badge")}</span> not on a sheet yet
                    </span>
                    <Button size="sm" variant="outline" onClick={() => overlay.open("job", j.id)}>
                      Fix the count
                    </Button>
                  </li>
                ))}
                {data.openJobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">
                        {j.kind === "REPRINT" ? "Reprint" : "Upload"} · {pluralize(j.readyPages, "sheet")}
                      </span>
                      <span className="text-xs text-muted-foreground">Started {shortTime(j.createdAt)}</span>
                    </span>
                    <Button size="sm" onClick={() => overlay.open("job", j.id)}>
                      Open preview
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="tray-h" className="flex flex-col gap-3">
            <SectionHead id="tray-h" title="Waiting tray" hint="Held back to complete a sheet. They go first on the next upload.">
              {data.tray.length > 0 && <ReleaseTray />}
            </SectionHead>
            {data.tray.length === 0 ? (
              <Empty>The tray is empty.</Empty>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {data.tray.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => overlay.open("view", t.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50">
                      <span className="truncate">{personLabel(t)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.chapter}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
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

function ReleaseTray() {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/tray", { method: "DELETE" });
          emitDeskChanged();
          toast.message("Tray emptied. Those badges are back in 'not printed'.");
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      Empty tray
    </Button>
  );
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
