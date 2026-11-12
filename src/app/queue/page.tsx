import { Suspense } from "react";

import { QueueView } from "@/features/queue/queue-view";

export default function QueuePage() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-5 py-8">
      <Suspense>
        <QueueView />
      </Suspense>
    </div>
  );
}
