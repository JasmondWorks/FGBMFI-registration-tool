"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api, errorMessage, getOperator, runPool } from "@/lib/api";
import { emitDeskChanged } from "@/lib/events";
import type { AnalyzedFile, JobView } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { collectFlags } from "./flags";
import {
  ACCEPTED_TYPES,
  ANALYZE_CONCURRENCY,
  MAX_FILE_MB,
  MAX_FILES_PER_UPLOAD,
  type Decision,
  type FlaggedFile,
  type IntakeFile,
} from "./types";

/**
 * The upload state machine:
 *   validate -> read every badge on the server (4 at a time) -> review duplicates (if any)
 *   -> accept files into an upload job -> lay out sheets of 4 -> open the preview.
 * The multiple-of-4 rule is handled in the preview, where the operator can see the sheets.
 */

type Phase = "idle" | "reading" | "review" | "saving";

export type IntakeState = {
  phase: Phase;
  files: IntakeFile[];
  flagged: FlaggedFile[];
  decisions: Record<string, Decision>;
  targetJobId: string | null;
};

const initial: IntakeState = { phase: "idle", files: [], flagged: [], decisions: {}, targetJobId: null };

export function validateFiles(input: File[]) {
  const accepted: File[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const allowedExt = Object.values(ACCEPTED_TYPES).flat();
  for (const f of input) {
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    const typeOk = (f.type && f.type in ACCEPTED_TYPES) || f.type === "image/jpg" || allowedExt.includes(ext);
    if (!typeOk) rejected.push({ name: f.name, reason: "Not a PDF, PNG or JPG" });
    else if (f.size > MAX_FILE_MB * 1024 * 1024) rejected.push({ name: f.name, reason: `Larger than ${MAX_FILE_MB} MB` });
    else if (f.size === 0) rejected.push({ name: f.name, reason: "Empty file" });
    else accepted.push(f);
  }
  const overflow = accepted.splice(MAX_FILES_PER_UPLOAD);
  for (const f of overflow) rejected.push({ name: f.name, reason: `Over the ${MAX_FILES_PER_UPLOAD}-file limit for one upload` });
  return { accepted, rejected };
}

export function useIntake(onJobReady: (jobId: string, job: JobView) => void) {
  const router = useRouter();
  const [state, setState] = React.useState<IntakeState>(initial);
  const busy = state.phase !== "idle";

  const reset = React.useCallback(() => setState(initial), []);

  const commit = React.useCallback(
    async (files: IntakeFile[], decisions: Record<string, Decision>, flagged: FlaggedFile[], targetJobId: string | null) => {
      setState((s) => ({ ...s, phase: "saving" }));
      try {
        const ready = files.filter((f) => f.status === "ready" && f.analysis);
        const flaggedByKey = new Map(flagged.map((f) => [f.file.key, f]));
        const items: { stagingId: string; supersedeCardIds?: string[] }[] = [];
        const excluded: string[] = [];
        for (const f of ready) {
          const d = decisions[f.key] ?? "keep";
          if (d === "exclude") excluded.push(f.analysis!.stagingId);
          else if (d === "replace") {
            const ids = (flaggedByKey.get(f.key)?.flags ?? [])
              .filter((x) => x.kind === "system" && x.match.type !== "EXACT_FILE" && x.match.type !== "SIMILAR_NAME")
              .map((x) => (x.kind === "system" ? x.match.existing.id : ""))
              .filter(Boolean);
            items.push({ stagingId: f.analysis!.stagingId, supersedeCardIds: ids });
          } else items.push({ stagingId: f.analysis!.stagingId });
        }

        const committed = await api<{ jobId: string | null; cardIds: string[] }>("/api/intake/commit", {
          method: "POST",
          json: { items, excludedStagingIds: excluded, jobId: targetJobId },
        });
        if (excluded.length) toast.message(`${pluralize(excluded.length, "file")} left out`);
        if (!committed.jobId || committed.cardIds.length === 0) {
          if (!targetJobId) toast.message("No new badges to add");
          setState(initial);
          emitDeskChanged();
          if (targetJobId) {
            const job = await api<JobView>(`/api/jobs/${targetJobId}`);
            onJobReady(targetJobId, job);
          }
          return;
        }
        emitDeskChanged();
        setState(initial);
        if (targetJobId) {
          // Adding files to a job someone's already actively working (e.g. the Fix the
          // Count dialog's "add more"): keep that flow as it was, stay in that preview.
          const layout = await api<{ ok: boolean; job: JobView }>(`/api/jobs/${committed.jobId}/layout`, { method: "POST", json: {} });
          onJobReady(committed.jobId, layout.job);
        } else {
          // A fresh upload: badges land in the global queue, then every complete sheet
          // the queue now supports (across all uploads, FIFO) builds and opens right
          // away — so a clean multiple-of-4 upload just prints, same as before the
          // queue existed. Any remainder that doesn't complete a sheet stays queued.
          const built = await api<{ built: boolean; queueTotal: number; remainder: number; ok?: boolean; job?: JobView }>(
            "/api/queue/build-all",
            { method: "POST", json: {} },
          );
          if (built.built && built.ok && built.job) {
            onJobReady(built.job.id, built.job);
            if (built.remainder > 0) {
              toast.message(`${pluralize(built.remainder, "badge")} still waiting — not enough left for another sheet yet.`, {
                action: { label: "Open queue", onClick: () => router.push("/queue") },
              });
            }
          } else {
            // Shows the real queue total, not just this upload's count — the gap between
            // the two (older leftovers from a prior uneven upload) is exactly what makes
            // an on-its-own-divisible-by-4 batch still come up short.
            toast.success(`${pluralize(committed.cardIds.length, "badge")} added to the queue`, {
              description: `${pluralize(built.queueTotal, "badge")} waiting in total — ${4 - (built.queueTotal % 4)} more needed for the next sheet.`,
              action: { label: "Open queue", onClick: () => router.push("/queue") },
            });
          }
        }
      } catch (err) {
        toast.error(errorMessage(err));
        setState((s) => ({ ...s, phase: s.flagged.length ? "review" : "idle" }));
      }
    },
    [onJobReady, router],
  );

  const start = React.useCallback(
    async (input: File[], targetJobId: string | null = null) => {
      if (busy) {
        toast.warning("Finish the current upload first");
        return;
      }
      if (!getOperator()) {
        toast.error("Choose who is at the desk first (top right)");
        return;
      }
      const { accepted, rejected } = validateFiles(input);
      if (rejected.length) {
        toast.error(`${pluralize(rejected.length, "file")} skipped`, {
          description: rejected.slice(0, 4).map((r) => `${r.name}: ${r.reason}`).join("\n") + (rejected.length > 4 ? `\n...and ${rejected.length - 4} more` : ""),
        });
      }
      if (accepted.length === 0) return;

      const files: IntakeFile[] = accepted.map((f, i) => ({ key: `${i}-${f.name}-${f.size}`, name: f.name, size: f.size, status: "pending" }));
      setState({ phase: "reading", files, flagged: [], decisions: {}, targetJobId });

      const update = (key: string, patch: Partial<IntakeFile>) =>
        setState((s) => ({ ...s, files: s.files.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));

      const results = await runPool(accepted, ANALYZE_CONCURRENCY, async (file, i) => {
        const key = files[i].key;
        update(key, { status: "reading" });
        const form = new FormData();
        form.append("file", file);
        try {
          const analysis = await api<AnalyzedFile>("/api/intake/analyze", { method: "POST", body: form });
          update(key, { status: "ready", analysis });
          return { ...files[i], status: "ready" as const, analysis };
        } catch (err) {
          update(key, { status: "failed", error: errorMessage(err) });
          return { ...files[i], status: "failed" as const, error: errorMessage(err) };
        }
      });

      const finished: IntakeFile[] = results.map((r, i) => (r.status === "fulfilled" ? r.value : { ...files[i], status: "failed", error: "Upload failed" }));
      const failed = finished.filter((f) => f.status === "failed");
      if (failed.length) {
        toast.error(`${pluralize(failed.length, "file")} couldn't be read`, {
          description: failed.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join("\n"),
        });
      }
      if (!finished.some((f) => f.status === "ready")) {
        setState(initial);
        return;
      }

      const flagged = collectFlags(finished);
      if (flagged.length) {
        setState({ phase: "review", files: finished, flagged, decisions: {}, targetJobId });
        return;
      }
      await commit(finished, {}, [], targetJobId);
    },
    [busy, commit],
  );

  const setDecision = React.useCallback((keys: string[], decision: Decision) => {
    setState((s) => ({ ...s, decisions: { ...s.decisions, ...Object.fromEntries(keys.map((k) => [k, decision])) } }));
  }, []);

  const finishReview = React.useCallback(() => {
    void commit(state.files, state.decisions, state.flagged, state.targetJobId);
  }, [commit, state]);

  const cancelReview = React.useCallback(() => setState(initial), []);

  return { state, busy, start, setDecision, finishReview, cancelReview, reset };
}
