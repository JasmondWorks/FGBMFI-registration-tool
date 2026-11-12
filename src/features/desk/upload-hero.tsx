"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IntakeProgress, useIntakeContext } from "@/features/intake/intake-provider";
import { ACCEPTED_TYPES, MAX_FILES_PER_UPLOAD } from "@/features/intake/types";
import { useOperator } from "@/features/operator/operator-context";

/**
 * One action to start: drop the files (or pick them) and the rest happens on its own.
 * Any number of files; they're read, checked for duplicates and laid out 4 per sheet,
 * then the print preview opens.
 */
export function UploadHero() {
  const intake = useIntakeContext();
  const { requireOperator } = useOperator();
  const busy = intake.busy;

  const onDrop = React.useCallback(
    (accepted: File[], rejected: { file: File }[]) => {
      if (!requireOperator()) return;
      // Pass everything through our own validation so the operator gets one clear message.
      const all = [...accepted, ...rejected.map((r) => r.file)];
      if (all.length) void intake.start(all);
    },
    [intake, requireOperator],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    noClick: true,
    noKeyboard: true,
    disabled: busy,
    multiple: true,
  });

  return (
    <section
      {...getRootProps()}
      aria-label="Upload badge files"
      className={cn(
        "relative grid overflow-hidden rounded-xl border bg-card transition-colors md:grid-cols-[1fr_auto]",
        isDragActive && "border-primary bg-accent/40",
      )}
    >
      <div className="flex flex-col justify-between gap-8 p-8 md:p-10">
        <input {...getInputProps()} aria-label="Badge files" />
        <div className="flex max-w-xl flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Lagos National Convention 2026</p>
          <h1 className="text-[34px] leading-[1.08] font-semibold tracking-[-0.025em] text-balance md:text-[42px]">
            {isDragActive ? "Release to read the badges" : "Drop the badge files here and the sheets lay themselves out"}
          </h1>
          <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Any number of PDFs from the registration platform. Each A4 sheet takes four, in the order you drop them, printed onto the
            pre-printed convention cards.
          </p>
        </div>

        {busy ? (
          <div className="max-w-md">
            <IntakeProgress />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button size="lg" onClick={open}>
              Choose badge files
            </Button>
            <span className="text-sm text-muted-foreground">
              or drag them anywhere on this panel. PDF, PNG or JPG, up to {MAX_FILES_PER_UPLOAD} at once.
            </span>
          </div>
        )}
      </div>

      <figure className="relative hidden w-[300px] shrink-0 items-center justify-center border-l bg-[oklch(0.95_0.008_80)] p-8 md:flex">
        <div className="relative w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/template/a4-template.jpg" alt="The pre-printed A4 sheet with four convention cards" className="a4-sheet w-full" />
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "absolute h-[3.2%] w-[26%] rounded-[2px] transition-colors",
                isDragActive ? "bg-primary/70" : "bg-foreground/15",
              )}
              style={{ left: `${(i % 2) * 50 + 12}%`, top: `${Math.floor(i / 2) * 50 + 26.5}%` }}
            />
          ))}
        </div>
        <figcaption className="absolute bottom-3 left-0 w-full text-center text-[11px] text-muted-foreground">Names print in the blank middle</figcaption>
      </figure>
    </section>
  );
}
