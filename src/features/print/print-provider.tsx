"use client";

import * as React from "react";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged } from "@/lib/events";
import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from "@/lib/types";
import { useOperator } from "@/features/operator/operator-context";
import { ConfirmPrintDialog } from "./confirm-print-dialog";

/**
 * Owns the whole print lifecycle so it survives navigation:
 *   build the sheet PDF -> mark pages sent -> print (browser dialog or direct to printer)
 *   -> wait -> ask the operator what actually came out.
 * Badges are only marked printed by that final answer.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "preparing"; pageIds: string[] }
  | { kind: "printing"; pageIds: string[]; mode: "BROWSER" | "DIRECT"; spooled: number };

type PrintContextValue = {
  phase: Phase;
  settings: PrintSettings;
  reloadSettings: () => Promise<void>;
  printPages: (pageIds: string[]) => Promise<void>;
  openConfirm: (pageIds: string[]) => void;
  printCalibration: () => Promise<void>;
};

const PrintContext = React.createContext<PrintContextValue | null>(null);

export function PrintProvider({ children }: { children: React.ReactNode }) {
  const { requireOperator } = useOperator();
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [settings, setSettings] = React.useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [confirmIds, setConfirmIds] = React.useState<string[] | null>(null);
  const timer = React.useRef<number | null>(null);
  const frame = React.useRef<HTMLIFrameElement | null>(null);

  const reloadSettings = React.useCallback(async () => {
    try {
      setSettings(await api<PrintSettings>("/api/settings"));
    } catch {
      // keep defaults; the settings page shows the error
    }
  }, []);
  React.useEffect(() => {
    let alive = true;
    api<PrintSettings>("/api/settings")
      .then((s) => alive && setSettings(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const openConfirm = React.useCallback((pageIds: string[]) => {
    if (timer.current) window.clearTimeout(timer.current);
    setConfirmIds(pageIds);
  }, []);

  /** Loads a PDF into a hidden iframe and opens the browser's print dialog for it. */
  const printBlob = React.useCallback((blob: Blob) => {
    return new Promise<void>((resolve, reject) => {
      frame.current?.remove();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;";
      iframe.src = url;
      iframe.onload = () => {
        window.setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve();
          } catch (err) {
            // Some browsers block printing PDFs from frames: open it in a tab instead.
            window.open(url, "_blank");
            reject(err);
          }
        }, 400);
      };
      document.body.appendChild(iframe);
      frame.current = iframe;
    });
  }, []);

  const pollSpooler = React.useCallback(async (pageIds: string[]) => {
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const status = await api<Record<string, string>>(`/api/print/status?pages=${pageIds.join(",")}`);
        const values = Object.values(status);
        const spooled = values.filter((s) => s === "SPOOLED").length;
        setPhase({ kind: "printing", pageIds, mode: "DIRECT", spooled });
        if (values.includes("PRINTER_ERROR")) {
          toast.error("The printer reported an error. Check it, then confirm what printed.");
          return;
        }
        if (spooled === pageIds.length) return;
      } catch {
        // keep polling; the confirmation step still follows
      }
    }
    toast.warning("The printer queue didn't confirm every page. Check the printed sheets.");
  }, []);

  const printPages = React.useCallback(
    async (pageIds: string[]) => {
      if (pageIds.length === 0 || !requireOperator()) return;
      if (phase.kind !== "idle") {
        toast.warning("A print is already in progress. Confirm it first.");
        return;
      }
      setPhase({ kind: "preparing", pageIds });
      try {
        const current = await api<PrintSettings>("/api/settings").catch(() => settings);
        setSettings(current);

        if (current.printMode === "DIRECT") {
          await api("/api/print/send", { method: "POST", json: { pageIds } });
          emitDeskChanged();
          setPhase({ kind: "printing", pageIds, mode: "DIRECT", spooled: 0 });
          toast.success(`Sent ${pageIds.length === 1 ? "1 sheet" : `${pageIds.length} sheets`} to ${current.printerName}`);
          await pollSpooler(pageIds);
          setPhase({ kind: "idle" });
          setConfirmIds(pageIds);
          return;
        }

        // Build the exact PDF first. If that fails nothing is marked as sent.
        const res = await fetch(`/api/print/sheet?pages=${pageIds.join(",")}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Couldn't build the print sheets");
        }
        const blob = await res.blob();
        await api("/api/print/send", { method: "POST", json: { pageIds } });
        emitDeskChanged();
        setPhase({ kind: "printing", pageIds, mode: "BROWSER", spooled: 0 });
        await printBlob(blob).catch(() =>
          toast.message("The PDF opened in a new tab. Print it from there at actual size."),
        );
        // The browser can't tell us what came out of the printer, so we ask.
        toast.message("Collect the sheets from the printer", {
          description: "You'll be asked to confirm which badges printed.",
          action: { label: "Confirm now", onClick: () => openConfirm(pageIds) },
          duration: current.confirmDelaySec * 1000,
        });
        timer.current = window.setTimeout(() => setConfirmIds(pageIds), current.confirmDelaySec * 1000);
        setPhase({ kind: "idle" });
      } catch (err) {
        setPhase({ kind: "idle" });
        toast.error(errorMessage(err));
      }
    },
    [phase.kind, requireOperator, settings, pollSpooler, printBlob, openConfirm],
  );

  const printCalibration = React.useCallback(async () => {
    try {
      const res = await fetch("/api/print/calibration");
      if (!res.ok) throw new Error("Couldn't build the calibration sheet");
      await printBlob(await res.blob());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [printBlob]);

  const value = React.useMemo(
    () => ({ phase, settings, reloadSettings, printPages, openConfirm, printCalibration }),
    [phase, settings, reloadSettings, printPages, openConfirm, printCalibration],
  );

  return (
    <PrintContext.Provider value={value}>
      {children}
      <ConfirmPrintDialog pageIds={confirmIds} onClose={() => setConfirmIds(null)} />
      {phase.kind === "printing" && phase.mode === "DIRECT" && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md border bg-card px-4 py-2.5 text-sm shadow-lg">
          Printer queue: <span className="tnum font-medium">{phase.spooled}</span> of{" "}
          <span className="tnum font-medium">{phase.pageIds.length}</span> sheets finished
        </div>
      )}
    </PrintContext.Provider>
  );
}

export function usePrint() {
  const ctx = React.useContext(PrintContext);
  if (!ctx) throw new Error("usePrint must be used inside PrintProvider");
  return ctx;
}
