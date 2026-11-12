import { Suspense } from "react";

import { ReprintBuilder } from "@/features/reprint/reprint-builder";

export default function ReprintPage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Reprint</h1>
        <p className="text-sm text-muted-foreground">
          Pick any number of badges. They go 4 to a sheet in list order, and every reprint is logged with its reason.
        </p>
      </div>
      <Suspense>
        <ReprintBuilder />
      </Suspense>
    </div>
  );
}
