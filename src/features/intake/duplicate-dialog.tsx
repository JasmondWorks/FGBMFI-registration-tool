"use client";

import * as React from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CARD_STATUS, exactTime, personLabel, relativeTime } from "@/lib/format";
import type { CardSummary } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { BadgeImage, cardFileUrl, stagingFileUrl } from "@/features/pdf/pdf-render";
import { matchesFilter, type FlagFilter } from "./flags";
import type { Decision, FlaggedFile, IntakeFile } from "./types";

const FILTERS: { id: FlagFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "exact", label: "Exact file" },
  { id: "person", label: "Same registration ID" },
  { id: "name", label: "Same name (no ID match)" },
  { id: "upload", label: "Repeated in this upload" },
  { id: "printed", label: "Already printed" },
];

const PAGE_SIZE = 8;

type Props = {
  open: boolean;
  totalFiles: number;
  files: IntakeFile[];
  flagged: FlaggedFile[];
  decisions: Record<string, Decision>;
  saving: boolean;
  onDecide: (keys: string[], decision: Decision) => void;
  onContinue: () => void;
  onCancel: () => void;
};

/**
 * Side-by-side comparison of each incoming file against what's already in the system
 * (or an earlier copy in the same upload). Excluding only ever affects the INCOMING file.
 */
export function DuplicateDialog({ open, totalFiles, files, flagged, decisions, saving, onDecide, onContinue, onCancel }: Props) {
  const [filter, setFilter] = React.useState<FlagFilter>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(0);
  const [confirmAll, setConfirmAll] = React.useState(false);

  // Start fresh each time the review opens (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFilter("all");
      setSelected(new Set());
      setPage(0);
    }
  }

  const visible = flagged.filter((f) => matchesFilter(f, filter));
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const fileByKey = new Map(files.map((f) => [f.key, f]));
  const excludedCount = flagged.filter((f) => decisions[f.file.key] === "exclude").length;
  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.file.key));
  const someVisibleSelected = visible.some((f) => selected.has(f.file.key));

  function toggle(key: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function onRowKey(e: React.KeyboardEvent, key: string) {
    if (e.key === " " && e.target === e.currentTarget) {
      e.preventDefault();
      toggle(key, !selected.has(key));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent className="flex h-[min(860px,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-5xl" showCloseButton={!saving}>
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle>
            {pluralize(flagged.length, "possible duplicate")} in {pluralize(totalFiles, "file")}
          </DialogTitle>
          <DialogDescription>
            Each row: your new file on the left, the existing match on the right. "Keep both" is the default — only "Exclude" or
            "Replace" change anything, and excluding never touches the existing record, only the new upload.
          </DialogDescription>
          <div className="mt-3 flex flex-wrap items-center gap-1" role="tablist" aria-label="Filter duplicates">
            {FILTERS.map((f) => {
              const count = flagged.filter((x) => matchesFilter(x, f.id)).length;
              if (f.id !== "all" && count === 0) return null;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => {
                    setFilter(f.id);
                    setPage(0);
                  }}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                    filter === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {f.label} <span className="tnum opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
          <Checkbox
            aria-label="Select all shown"
            checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
            onCheckedChange={(v) => {
              setSelected((prev) => {
                const next = new Set(prev);
                for (const f of visible) {
                  if (v) next.add(f.file.key);
                  else next.delete(f.file.key);
                }
                return next;
              });
            }}
          />
          <span className="flex-1">Incoming file (left) against the badge already in the system (right)</span>
          {pageCount > 1 && (
            <span className="tnum">
              {page * PAGE_SIZE + 1}–{Math.min(visible.length, (page + 1) * PAGE_SIZE)} of {visible.length}
            </span>
          )}
        </div>

        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {pageRows.map(({ file, flags }) => {
            const a = file.analysis!;
            const decision = decisions[file.key] ?? "keep";
            const top = flags[0];
            const existing: { card?: CardSummary; incoming?: IntakeFile } =
              top.kind === "system" ? { card: top.match.existing } : { incoming: fileByKey.get(top.otherKey) };
            const canReplace = flags.some((f) => f.kind === "system" && f.match.type !== "EXACT_FILE" && f.match.type !== "OLDER_VERSION");
            const isSelected = selected.has(file.key);
            return (
              <li
                key={file.key}
                tabIndex={0}
                onKeyDown={(e) => onRowKey(e, file.key)}
                className={cn(
                  "grid grid-cols-[auto_1fr] gap-4 px-6 py-4 outline-none focus-visible:bg-accent/40",
                  decision === "exclude" && "bg-muted/60",
                )}
              >
                <Checkbox className="mt-1" checked={isSelected} onCheckedChange={(v) => toggle(file.key, !!v)} aria-label={`Select ${a.fullName}`} />
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {flags.map((f, i) => (
                      <Badge key={i} variant={(f.kind === "system" ? f.match.strength : f.strength) === 3 ? "danger" : "warning"}>
                        {f.kind === "system" ? f.match.label : f.label}
                      </Badge>
                    ))}
                    {decision === "exclude" && <Badge variant="outline">Excluded</Badge>}
                    {decision === "replace" && <Badge variant="info">Will replace the old badge</Badge>}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Side
                      heading="Incoming"
                      imageSrc={stagingFileUrl(a.stagingId)}
                      mimeType={a.mimeType}
                      name={personLabel(a)}
                      lines={[
                        [a.district, a.chapter].filter(Boolean).join(" · ") || "No district or chapter",
                        a.registrationId ? `ID ${a.registrationId}` : "No registration ID",
                        a.badgeGeneratedAt ? `Generated ${exactTime(a.badgeGeneratedAt)}` : file.name,
                      ]}
                      muted={decision === "exclude"}
                    />
                    {existing.card ? (
                      <Side
                        heading="Already in the system"
                        imageSrc={cardFileUrl(existing.card.id)}
                        mimeType={existing.card.mimeType}
                        name={personLabel(existing.card)}
                        status={CARD_STATUS[existing.card.status]}
                        lines={[
                          [existing.card.district, existing.card.chapter].filter(Boolean).join(" · ") || "No district or chapter",
                          existing.card.registrationId ? `ID ${existing.card.registrationId}` : "No registration ID",
                          existing.card.printCount > 0
                            ? `Printed ${existing.card.printCount}x, last ${relativeTime(existing.card.lastPrintedAt)} by ${existing.card.lastPrintedBy ?? "unknown"}`
                            : `Uploaded ${relativeTime(existing.card.createdAt)} by ${existing.card.uploadedBy}, not printed`,
                        ]}
                      />
                    ) : existing.incoming?.analysis ? (
                      <Side
                        heading="Earlier in this upload"
                        imageSrc={stagingFileUrl(existing.incoming.analysis.stagingId)}
                        mimeType={existing.incoming.analysis.mimeType}
                        name={personLabel(existing.incoming.analysis)}
                        lines={[
                          [existing.incoming.analysis.district, existing.incoming.analysis.chapter].filter(Boolean).join(" · "),
                          existing.incoming.analysis.registrationId ? `ID ${existing.incoming.analysis.registrationId}` : "",
                          existing.incoming.name,
                        ]}
                      />
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={decision === "keep" ? "secondary" : "ghost"} onClick={() => onDecide([file.key], "keep")}>
                      Keep both (default)
                    </Button>
                    {canReplace && (
                      <Button size="sm" variant={decision === "replace" ? "default" : "outline"} onClick={() => onDecide([file.key], "replace")}>
                        Replace the old one with this
                      </Button>
                    )}
                    <Button size="sm" variant={decision === "exclude" ? "default" : "outline"} onClick={() => onDecide([file.key], "exclude")}>
                      Exclude this new one
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-col gap-3 border-t bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {pageCount > 1 && (
              <>
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </>
            )}
            <span className="text-xs text-muted-foreground">
              {excludedCount > 0 ? `${pluralize(excludedCount, "file")} will be excluded` : "Nothing excluded yet"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={selected.size === 0 || saving} onClick={() => onDecide([...selected], "exclude")}>
              Exclude selected ({selected.size})
            </Button>
            <Button variant="outline" disabled={saving} onClick={() => setConfirmAll(true)}>
              Exclude all duplicates
            </Button>
            <Button disabled={saving} onClick={onContinue}>
              {saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </footer>

        <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Exclude all {flagged.length} flagged files?</AlertDialogTitle>
              <AlertDialogDescription>
                The incoming copies won&apos;t be added. Badges already in the system stay exactly as they are.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go back</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onDecide(
                    flagged.map((f) => f.file.key),
                    "exclude",
                  );
                }}
              >
                Leave them out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function Side({
  heading,
  imageSrc,
  mimeType,
  name,
  lines,
  status,
  muted,
}: {
  heading: string;
  imageSrc: string;
  mimeType: string;
  name: string;
  lines: string[];
  status?: { label: string; tone: "success" | "warning" | "danger" | "info" | "secondary" | "outline" };
  muted?: boolean;
}) {
  return (
    <div className={cn("flex gap-3 rounded-md border bg-card p-3", muted && "opacity-55")}>
      <div className="w-[118px] shrink-0 overflow-hidden rounded-sm border">
        <BadgeImage src={imageSrc} mimeType={mimeType} width={118} alt={`Badge for ${name}`} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{heading}</span>
        <span className="truncate text-sm font-semibold">{name}</span>
        {status && <Badge variant={status.tone}>{status.label}</Badge>}
        {lines.filter(Boolean).map((l, i) => (
          <span key={i} className="truncate text-xs text-muted-foreground">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
