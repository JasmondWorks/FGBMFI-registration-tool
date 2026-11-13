import { Suspense } from "react";

import { HomeContent } from "@/features/desk/home-content";

export default function PrintDeskPage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
