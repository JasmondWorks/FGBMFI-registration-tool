import { Suspense } from "react";

import { RecordsView } from "@/features/records/records-view";

export default function RecordsPage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Records</h1>
        <p className="text-sm text-muted-foreground">Every badge uploaded at this desk, what printed, when, and by whom.</p>
      </div>
      <Suspense>
        <RecordsView />
      </Suspense>
    </div>
  );
}
