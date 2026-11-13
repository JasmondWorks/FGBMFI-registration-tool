"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { useMode } from "@/lib/use-mode";
import { useOperator } from "@/features/operator/operator-context";
import { AUDIT_LABELS, CARD_STATUS, exactTime, PAGE_STATUS, personLabel, relativeTime } from "@/lib/format";
import type { AuditEntry, CardDetail } from "@/lib/types";
import { BadgeImage, cardFileUrl } from "@/features/pdf/pdf-render";
import { useOverlay } from "@/features/overlays/use-overlay";
import { SlotEditor } from "@/features/preview/slot-editor";
import { CropEditor } from "@/features/badges/crop-editor";
import { SheetView } from "@/features/preview/sheet-view";
import { addToReprintDraft, getReprintDraft, setReprintDraft } from "@/features/reprint/reprint-draft";

/**
 * The one place a badge is shown in full, opened from anywhere with ?view=<id>:
 * the original file, its details, and its complete print history for audits.
 */
export function BadgeViewer() {
  const overlay = useOverlay();
  const { requireOperator } = useOperator();
  const [mode] = useMode();
  const isPrinter = mode === "printer";
  const canCollect = mode !== "uploader";
  const id = overlay.view;
  const { data, error, reload } = useFetch(id ? `card:${id}` : null, () => api<CardDetail>(`/api/cards/${id}`));
  const card = data && data.id === id ? data : null;
  const [onCard, setOnCard] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [markingGivenOut, setMarkingGivenOut] = React.useState(false);

  const [shownId, setShownId] = React.useState(id);
  if (id !== shownId) {
    setShownId(id);
    setOnCard(false);
  }

  function reprint() {
    if (!card) return;
    setReprintDraft({ cardIds: [card.id] });
    overlay.swap("view", "reprint", "1");
  }

  async function deleteBadge() {
    if (!card || !requireOperator()) return;
    setDeleting(true);
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" });
      emitDeskChanged();
      toast.success(`${card.fullName}'s badge was deleted`);
      overlay.close("view");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }
  function addToList() {
    if (!card) return;
    addToReprintDraft([card.id]);
    toast.success(`${card.fullName} added to the reprint list`, {
      action: { label: "Open list", onClick: () => overlay.swap("view", "reprint", "1") },
    });
  }

  async function toggleGivenOut() {
    if (!card || !requireOperator()) return;
    setMarkingGivenOut(true);
    try {
      await api(`/api/cards/${card.id}/given-out`, { method: card.status === "GIVEN_OUT" ? "DELETE" : "POST" });
      emitDeskChanged();
      reload();
      toast.success(card.status === "GIVEN_OUT" ? `Undone — ${card.fullName}'s badge is back to printed` : `${card.fullName}'s badge marked given out`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setMarkingGivenOut(false);
    }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && overlay.close("view")}>
      <SheetContent className="sm:max-w-[760px]">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {card ? personLabel(card) : "Badge"}
            {card && <Badge variant={CARD_STATUS[card.status].tone}>{CARD_STATUS[card.status].label}</Badge>}
            {card && card.printCount > 1 && <Badge variant="info">Printed {card.printCount}x</Badge>}
          </SheetTitle>
          <SheetDescription className="truncate">{card?.originalFilename ?? (error || "Loading")}</SheetDescription>
        </SheetHeader>

        {!card && !error && (
          <div className="grid grid-cols-[260px_1fr] gap-6 p-6">
            <Skeleton className="aspect-[105/148]" />
            <Skeleton className="h-64" />
          </div>
        )}
        {error && <p className="p-6 text-sm text-destructive">{error}</p>}

        {card && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[260px_1fr]">
            <div className="flex flex-col gap-3">
              <div className="flex gap-1 text-xs">
                <button onClick={() => setOnCard(false)} className={onCard ? "text-muted-foreground" : "font-medium underline underline-offset-4"}>
                  Badge file
                </button>
                <span className="text-muted-foreground">/</span>
                <button onClick={() => setOnCard(true)} className={!onCard ? "text-muted-foreground" : "font-medium underline underline-offset-4"}>
                  On the card
                </button>
              </div>
              <div className="overflow-hidden rounded-md border">
                {onCard ? (
                  <div className="relative aspect-[105/148] overflow-hidden">
                    {/* Top-left quarter of the template sheet, at the same scale. */}
                    <div className="absolute top-0 left-0 w-[200%]">
                      <SheetView items={[{ slot: 1, card }]} renderWidth={520} />
                    </div>
                  </div>
                ) : (
                  <BadgeImage src={cardFileUrl(card.id)} mimeType={card.mimeType} width={260} alt={`Badge for ${card.fullName}`} />
                )}
              </div>
              {isPrinter && (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={reprint} disabled={card.status === "DISCARDED"}>
                    Reprint
                  </Button>
                  <Button variant="outline" onClick={addToList} disabled={card.status === "DISCARDED"}>
                    {getReprintDraft().cardIds.includes(card.id) ? "In reprint list" : "Add to list"}
                  </Button>
                </div>
              )}
              {canCollect && (card.status === "PRINTED" || card.status === "GIVEN_OUT") && (
                <Button
                  variant={card.status === "GIVEN_OUT" ? "outline" : "default"}
                  disabled={markingGivenOut}
                  onClick={toggleGivenOut}
                >
                  {markingGivenOut ? "Saving..." : card.status === "GIVEN_OUT" ? "Undo — mark as not given out" : "Mark badge as given out"}
                </Button>
              )}
              {canCollect && card.status !== "PRINTED" && card.status !== "GIVEN_OUT" && card.status !== "DISCARDED" && (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Not confirmed printed yet — nothing to hand out.
                </p>
              )}
              <Button variant="ghost" size="sm" asChild>
                <a href={`${cardFileUrl(card.id)}?download=1`}>Download original</a>
              </Button>
              {card.supersededById && (
                <Button variant="link" size="sm" onClick={() => overlay.open("view", card.supersededById!)}>
                  Open the newer badge
                </Button>
              )}
              {card.supersedes && (
                <Button variant="link" size="sm" onClick={() => overlay.open("view", card.supersedes!.id)}>
                  Open the badge this replaced
                </Button>
              )}
              {isPrinter && card.status !== "DISCARDED" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      Delete this badge
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {card.fullName}&apos;s badge?</AlertDialogTitle>
                      <AlertDialogDescription>
                        For a wrong upload, duplicate, or typo&apos;d entry. It&apos;s removed from search, the queue, and duplicate
                        checks, but stays in the audit trail. This can&apos;t be undone from here — ask an admin if you need it back.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction disabled={deleting} onClick={deleteBadge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {deleting ? "Deleting..." : "Delete badge"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="history">History ({card.history.length})</TabsTrigger>
                <TabsTrigger value="sheets">Sheets ({card.pages.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex flex-col gap-5">
                <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
                  <Row label="Titles" value={card.titles.join(" ") || "None"} />
                  <Row label="Full name" value={card.fullName} />
                  {card.postNominals.length > 0 && <Row label="Post-nominals" value={card.postNominals.join(" ")} />}
                  <Row label="District" value={card.district ?? "Not on badge"} />
                  <Row label="Chapter" value={card.chapter ?? "Not on badge"} />
                  <Row label="Registration ID" value={card.registrationId ?? "Not on badge"} mono />
                  {Object.entries(card.extraFields).map(([k, v]) => (
                    <Row key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} value={v} />
                  ))}
                  <Row label="Badge generated" value={card.badgeGeneratedAt ? exactTime(card.badgeGeneratedAt) : "Unknown"} />
                  <Row label="Uploaded" value={`${exactTime(card.createdAt)} by ${card.uploadedBy}`} />
                  <Row label="Printed" value={card.printCount ? `${card.printCount}x, first ${exactTime(card.firstPrintedAt)}, last ${exactTime(card.lastPrintedAt)} by ${card.lastPrintedBy}` : "Not yet"} />
                  <Row label="Read from" value={card.extractionSource === "TEXT_LAYER" ? "Badge text (strong)" : card.extractionSource === "OCR" ? "OCR scan" : "Filename only (weak)"} />
                  <Row label="Cloud backup" value={{ SYNCED: "Backed up", PENDING: "Pending", FAILED: "Failed, will retry", DISABLED: "Off" }[card.cloudStatus]} />
                </dl>
                <div className="rounded-md border p-4">
                  <h3 className="mb-3 text-sm font-medium">Correct the recorded details</h3>
                  <SlotEditor card={card} onSaved={reload} />
                </div>
                {card.badgeFormat === "FULL_CARD" && (
                  <div className="rounded-md border border-warning/40 bg-warning-soft/40 p-4">
                    <h3 className="mb-1 text-sm font-medium">Crop the dynamic area</h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      This file has the whole card baked in, not just a name overlay — pick the region that should actually print.
                    </p>
                    <CropEditor card={card} onSaved={reload} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history">
                <Timeline entries={card.history} onOpenPage={(pid) => overlay.open("page", pid)} />
              </TabsContent>

              <TabsContent value="sheets">
                {card.pages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This badge hasn&apos;t been placed on a sheet.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {card.pages.map((p) => (
                      <li key={p.pageId}>
                        <button onClick={() => overlay.open("page", p.pageId)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50">
                          <span>
                            {p.jobKind === "REPRINT" ? "Reprint sheet" : "Sheet"} {p.pageNumber}, slot {p.slot}
                            <span className="block text-xs text-muted-foreground">{p.sentAt ? `Sent ${exactTime(p.sentAt)}` : "Not sent"}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {p.printed === false && <Badge variant="danger">Failed</Badge>}
                            <Badge variant={PAGE_STATUS[p.status].tone}>{PAGE_STATUS[p.status].label}</Badge>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs leading-5 break-all" : ""}>{value}</dd>
    </>
  );
}

export function Timeline({ entries, onOpenPage }: { entries: AuditEntry[]; onOpenPage?: (pageId: string) => void }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l pl-5">
      {entries.map((e) => {
        const reason = typeof e.payload.reason === "string" ? e.payload.reason : null;
        const changes = e.payload.changes as Record<string, { from: unknown; to: unknown }> | undefined;
        const spooler = typeof e.payload.spoolerJobId === "string" ? e.payload.spoolerJobId : null;
        return (
          <li key={e.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-primary/70 ring-4 ring-card" />
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{AUDIT_LABELS[e.type] ?? e.type}</span>
              <span className="text-xs text-muted-foreground" title={exactTime(e.createdAt)}>
                {relativeTime(e.createdAt)} · {e.actor}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {exactTime(e.createdAt)}
              {reason && ` · Reason: ${reason}`}
              {spooler && ` · Printer job ${spooler}`}
              {typeof e.payload.mode === "string" && ` · ${e.payload.mode === "DIRECT" ? "Direct print" : "Browser print"}`}
            </div>
            {changes && (
              <ul className="mt-1 text-xs">
                {Object.entries(changes).map(([k, v]) => (
                  <li key={k}>
                    {k}: <span className="line-through opacity-60">{String(v.from ?? "empty")}</span> → {String(v.to ?? "empty")}
                  </li>
                ))}
              </ul>
            )}
            {e.pageId && onOpenPage && (
              <button className="mt-0.5 text-xs text-primary underline-offset-4 hover:underline" onClick={() => onOpenPage(e.pageId!)}>
                Open sheet
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
