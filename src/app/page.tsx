import { Suspense } from "react";

import { DeskOverview } from "@/features/desk/desk-overview";
import { UploadHero } from "@/features/desk/upload-hero";

export default function PrintDeskPage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-5 py-8">
      <Suspense>
        <UploadHero />
        <DeskOverview />
      </Suspense>
    </div>
  );
}
