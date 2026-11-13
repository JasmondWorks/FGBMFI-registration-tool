"use client";

import { useMode } from "@/lib/use-mode";
import { CollectionConfirm } from "@/features/collection/collection-confirm";
import { DeskOverview } from "./desk-overview";
import { MyUploads } from "./my-uploads";
import { QueueSearch } from "./queue-search";
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
        <>
          <MyUploads />
          <QueueSearch />
        </>
      )}
    </div>
  );
}
