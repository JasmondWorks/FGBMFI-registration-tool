"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { exactTime, PAGE_STATUS, personLabel } from "@/lib/format";
import type { PageView } from "@/lib/types";
import { useOverlay } from "@/features/overlays/use-overlay";
import { usePrint } from "@/features/print/print-provider";
import { SheetView } from "@/features/preview/sheet-view";
import { setReprintDraft } from "@/features/reprint/reprint-draft";

/** One printed (or ready) A4 sheet exactly as it was laid out, opened with ?page=<id>. */
export function PageViewer() {
  const overlay = useOverlay();
  const { settings, openConfirm } = usePrint();
  const id = overlay.page;
  const { data, error } = useFetch(id ? `page:${id}` : null, () => api<{ pages: PageView[] }>(`/api/pages?ids=${id}`));
  const page = data?.pages[0]?.id === id ? data.pages[0] : null;

  function reprint(cardIds: string[]) {
    setReprintDraft({ cardIds });
    overlay.swap("page", "reprint", "1");
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && overlay.close("page")}>
      <SheetContent className="sm:max-w-[680px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {page ? `${page.jobKind === "REPRINT" ? "Reprint sheet" : "Sheet"} ${page.pageNumber}` : "Sheet"}
            {page && <Badge variant={PAGE_STATUS[page.status].tone}>{PAGE_STATUS[page.status].label}</Badge>}
          </SheetTitle>
          <SheetDescription>
            {page
              ? [
                  page.jobReason && `Reason: ${page.jobReason}`,
                  page.sentAt && `Sent ${exactTime(page.sentAt)} by ${page.sentBy}`,
                  page.confirmedAt && `checked ${exactTime(page.confirmedAt)} by ${page.confirmedBy}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Not printed yet"
              : error || "Loading"}
          </SheetDescription>
        </SheetHeader>
        {!page && !error && <Skeleton className="m-6 aspect-[210/297]" />}
        {page && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 sm:grid-cols-[1fr_220px]">
            <SheetView
              items={page.items.map((i) => ({ slot: i.slot, card: i.card, printed: i.printed }))}
              offsetXmmRow1={settings.offsetXmmRow1}
              offsetYmmRow1={settings.offsetYmmRow1}
              offsetXmmRow2={settings.offsetXmmRow2}
              offsetYmmRow2={settings.offsetYmmRow2}
              renderWidth={420}
            />
            <div className="flex flex-col gap-4">
              <ol className="divide-y rounded-md border">
                {page.items.map((i) => (
                  <li key={i.itemId} className="flex flex-col gap-1 px-3 py-2.5">
                    <button className="truncate text-left text-sm font-medium hover:underline" onClick={() => overlay.open("view", i.card.id)}>
                      {i.slot}. {personLabel(i.card)}
                    </button>
                    <span className="flex items-center justify-between text-xs text-muted-foreground">
                      {i.printed === true ? "Printed" : i.printed === false ? "Failed" : "Not checked"}
                      <button className="text-primary hover:underline" onClick={() => reprint([i.card.id])}>
                        Reprint
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2">
                {(page.status === "SENT" || page.status === "SPOOLED") && <Button onClick={() => openConfirm([page.id])}>Confirm this sheet</Button>}
                <Button variant="outline" onClick={() => reprint(page.items.map((i) => i.card.id))}>
                  Reprint whole sheet
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    overlay.close("page");
                    overlay.open("job", page.jobId);
                  }}
                >
                  Open its print preview
                </Button>
              </div>
              {page.printMode && (
                <p className="text-xs leading-5 text-muted-foreground">
                  {page.printMode === "DIRECT" ? `Printed directly on ${page.printerName}` : "Printed through the browser dialog"}
                  {page.spoolerJobId && <span className="block font-mono">Job {page.spoolerJobId}</span>}
                </p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
