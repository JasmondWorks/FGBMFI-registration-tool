"use client";

import { useMode } from "@/lib/use-mode";
import { CollectionConfirm } from "@/features/collection/collection-confirm";
import { DeskOverview } from "./desk-overview";
import { UploadHero } from "./upload-hero";

/**
 * An Uploader device just needs the drop zone — the "Built, not printed" / "Confirm what
 * printed" sections below are entirely about the print pipeline, which that device never
 * touches. A Collection device is about the opposite end of the process: finding someone
 * and confirming their badge actually left the desk with them.
 */
export function HomeContent() {
  const [mode] = useMode();
  if (mode === "collection") {
    return (
      <div className="mx-auto flex max-w-[1440px] flex-col px-5 py-16">
        <CollectionConfirm />
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-5 py-8">
      <UploadHero />
      {mode === "printer" ? (
        <DeskOverview />
      ) : (
        <p className="max-w-lg text-sm text-muted-foreground">
          Looking for someone&apos;s badge? Press <kbd className="rounded border bg-card px-1.5 py-0.5 text-xs">Ctrl/Cmd K</kbd> or use
          the search icon in the top bar to find it by name and see whether it&apos;s printed yet.
        </p>
      )}
    </div>
  );
}
