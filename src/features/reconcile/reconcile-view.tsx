"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, errorMessage, runPool } from "@/lib/api";
import { emitDeskChanged } from "@/lib/events";
import type { AnalyzedFile, CardSummary } from "@/lib/types";
import { personLabel } from "@/lib/format";
import { pluralize } from "@/lib/utils";
import { useOperator } from "@/features/operator/operator-context";

type ScanResult = {
  rawText: string;
  extractedName: string | null;
  extractedId: string | null;
  extractedDistrict: string | null;
  extractedChapter: string | null;
  match: CardSummary | null;
  matchedBy: "ID" | "NAME" | null;
  alreadyPrinted: boolean;
};

type ScanRow = { key: string; photoName: string; status: "scanning" | "done" | "failed"; error?: string; result?: ScanResult; added?: boolean };

const SCAN_CONCURRENCY = 3;

/**
 * Reconcile badges that were physically printed but that the system doesn't know were
 * printed (printed elsewhere, or before tracking started): photograph them, OCR reads the
 * name/ID off the card, and it's matched against existing badges. Matches that aren't
 * marked printed yet get marked now. Anything with no match at all needs its file uploaded
 * so a record exists to mark as printed. This only tracks print status, not whether the
 * badge has actually reached its owner.
 */
export function ReconcileView() {
  const { requireOperator } = useOperator();
  const [rows, setRows] = React.useState<ScanRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<Record<string, HTMLInputElement | null>>({});

  const toConfirm = rows.filter((r) => r.result?.match && !r.result.alreadyPrinted && !r.added);
  const unmatched = rows.filter((r) => r.status === "done" && !r.result?.match && !r.added);

  async function onPhotos(files: File[]) {
    if (files.length === 0) return;
    if (!requireOperator()) return;
    const newRows: ScanRow[] = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, photoName: f.name, status: "scanning" }));
    setRows((prev) => [...newRows, ...prev]);
    setBusy(true);
    await runPool(files, SCAN_CONCURRENCY, async (file, i) => {
      const key = newRows[i].key;
      try {
        const form = new FormData();
        form.append("file", file);
        const result = await api<ScanResult>("/api/reconcile/scan", { method: "POST", body: form });
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: "done", result } : r)));
      } catch (err) {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: "failed", error: errorMessage(err) } : r)));
      }
    });
    setBusy(false);
  }

  async function confirmMatched() {
    if (!requireOperator() || toConfirm.length === 0) return;
    setBusy(true);
    try {
      const cardIds = toConfirm.map((r) => r.result!.match!.id);
      await api("/api/reconcile/confirm", { method: "POST", json: { cardIds } });
      setRows((prev) => prev.map((r) => (toConfirm.some((t) => t.key === r.key) ? { ...r, added: true } : r)));
      emitDeskChanged();
      toast.success(`${pluralize(cardIds.length, "badge")} marked as printed`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadMissing(row: ScanRow, file: File) {
    if (!requireOperator()) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const analyzed = await api<AnalyzedFile>("/api/intake/analyze", { method: "POST", body: form });
      await api("/api/reconcile/add", { method: "POST", json: { stagingId: analyzed.stagingId } });
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, added: true } : r)));
      emitDeskChanged();
      toast.success(`${analyzed.fullName} added and marked printed`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Verify already-printed badges</h1>
        <p className="text-sm text-muted-foreground">
          For badges physically printed before the system knew about them. Photograph each one; it's matched against existing
          records and marked printed if it wasn't already. This only confirms a badge was <strong>printed</strong> — not that it's
          been handed to its owner.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void onPhotos(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          Take or choose photos
        </Button>
        {rows.length > 0 && (
          <Button variant="outline" onClick={() => setRows([])} disabled={busy}>
            Clear list
          </Button>
        )}
      </div>

      {toConfirm.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm font-medium">{pluralize(toConfirm.length, "badge")} matched, not marked printed yet</span>
          <Button size="sm" className="ml-auto" onClick={confirmMatched} disabled={busy}>
            Confirm printed
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No scans yet. Take or choose photos of printed badges to check them against the system.
        </div>
      ) : (
        <ol className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 p-3">
              <div className="flex min-w-0 flex-1 flex-col">
                {r.status === "scanning" && <span className="text-sm text-muted-foreground">Reading {r.photoName}…</span>}
                {r.status === "failed" && <span className="text-sm text-destructive">{r.photoName}: {r.error}</span>}
                {r.status === "done" && (
                  <>
                    <span className="truncate text-sm font-medium">
                      {r.result?.extractedName ? r.result.extractedName : `Couldn't read a name (${r.photoName})`}
                      {r.result?.match && <span className="ml-1 font-normal text-muted-foreground">→ {personLabel(r.result.match)}</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[r.result?.extractedDistrict, r.result?.extractedChapter, r.result?.extractedId].filter(Boolean).join(" · ") || "No details read"}
                    </span>
                  </>
                )}
              </div>
              {r.added && <Badge variant="success">Printed</Badge>}
              {!r.added && r.status === "done" && r.result?.match && r.result.alreadyPrinted && <Badge variant="outline">Already tracked</Badge>}
              {!r.added && r.status === "done" && r.result?.match && !r.result.alreadyPrinted && <Badge variant="warning">Will mark printed</Badge>}
              {!r.added && r.status === "done" && !r.result?.match && (
                <>
                  <Badge variant="danger">No match</Badge>
                  <input
                    ref={(el) => {
                      uploadInputRef.current[r.key] = el;
                    }}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadMissing(r, file);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={() => uploadInputRef.current[r.key]?.click()}>
                    Upload file
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
