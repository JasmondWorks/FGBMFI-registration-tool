"use client";

import * as React from "react";

import { Progress } from "@/components/ui/misc";
import type { JobView } from "@/lib/types";
import { useMode } from "@/lib/use-mode";
import { useOverlay } from "@/features/overlays/use-overlay";
import { DuplicateDialog } from "./duplicate-dialog";
import { useIntake } from "./use-intake";

type IntakeContextValue = ReturnType<typeof useIntake>;
const IntakeContext = React.createContext<IntakeContextValue | null>(null);

/**
 * App-wide upload pipeline, so the hero, "add more files" in the preview, and the
 * duplicate review all share one state. When a batch is ready the preview opens itself —
 * except on an Uploader device, which never sees the print pipeline at all, so a finished
 * sheet shouldn't pop a print preview in front of someone who's just trying to keep dropping
 * files in.
 */
export function IntakeProvider({ children }: { children: React.ReactNode }) {
  const overlay = useOverlay();
  const [mode] = useMode();
  const openRef = React.useRef(overlay.open);
  const modeRef = React.useRef(mode);
  React.useEffect(() => {
    openRef.current = overlay.open;
    modeRef.current = mode;
  });
  const onJobReady = React.useCallback((jobId: string, _job: JobView) => {
    if (modeRef.current === "printer") openRef.current("job", jobId);
  }, []);
  const intake = useIntake(onJobReady);
  const { state } = intake;

  return (
    <IntakeContext.Provider value={intake}>
      {children}
      <DuplicateDialog
        open={state.phase === "review" || (state.phase === "saving" && state.flagged.length > 0)}
        totalFiles={state.files.length}
        files={state.files}
        flagged={state.flagged}
        decisions={state.decisions}
        saving={state.phase === "saving"}
        onDecide={intake.setDecision}
        onContinue={intake.finishReview}
        onCancel={intake.cancelReview}
      />
    </IntakeContext.Provider>
  );
}

export function useIntakeContext() {
  const ctx = React.useContext(IntakeContext);
  if (!ctx) throw new Error("useIntakeContext must be used inside IntakeProvider");
  return ctx;
}

/** Compact progress readout used in the hero and in the preview while adding files. */
export function IntakeProgress() {
  const { state } = useIntakeContext();
  if (state.phase === "idle") return null;
  const done = state.files.filter((f) => f.status === "ready" || f.status === "failed").length;
  const failed = state.files.filter((f) => f.status === "failed").length;
  const total = state.files.length;
  const label =
    state.phase === "reading"
      ? `Reading badges ${done} of ${total}`
      : state.phase === "review"
        ? "Waiting for your duplicate check"
        : "Laying out sheets";
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tnum text-xs text-muted-foreground">
          {failed > 0 ? `${failed} failed · ` : ""}
          {Math.round((done / Math.max(total, 1)) * 100)}%
        </span>
      </div>
      <Progress value={state.phase === "reading" ? (done / Math.max(total, 1)) * 100 : 100} />
    </div>
  );
}
