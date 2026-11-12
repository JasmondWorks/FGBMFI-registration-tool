import { Suspense } from "react";

import { DangerZone } from "@/features/settings/danger-zone";
import { SettingsForm } from "@/features/settings/settings-form";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="text-sm text-muted-foreground">Printer and alignment for this laptop.</p>
      </div>
      <Suspense>
        <SettingsForm />
      </Suspense>
      <DangerZone />
    </div>
  );
}
