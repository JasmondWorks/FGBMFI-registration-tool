"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOverlay } from "@/features/overlays/use-overlay";
import { ReprintBuilder } from "./reprint-builder";

/**
 * Reprint, as an overlay over wherever you already are — Records, the badge viewer, a
 * failed-print confirmation — instead of a full navigation to /reprint that drops
 * whatever search/filters/scroll you had. Driven by the same ?reprint= URL pattern as
 * every other overlay, so it survives a refresh and the back button closes it. /reprint
 * still works as a direct page for deliberately starting a reprint session from scratch.
 */
export function ReprintOverlay() {
  const overlay = useOverlay();
  const open = overlay.reprint === "1";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && overlay.close("reprint")}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[1200px]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Reprint</SheetTitle>
          <SheetDescription>Pick any number of badges. They go 4 to a sheet in list order, and every reprint is logged with its reason.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {open && <ReprintBuilder onDone={(jobId) => overlay.swap("reprint", "job", jobId)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
