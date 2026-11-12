"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Toaster, TooltipProvider } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { IntakeProvider } from "@/features/intake/intake-provider";
import { OperatorProvider } from "@/features/operator/operator-context";
import { OperatorPicker } from "@/features/operator/operator-picker";
import { JobPreview } from "@/features/preview/job-preview";
import { PrintProvider } from "@/features/print/print-provider";
import { QuickFind } from "@/features/quick-find/quick-find";
import { BadgeViewer } from "@/features/viewer/badge-viewer";
import { PageViewer } from "@/features/viewer/page-viewer";

const NAV = [
  { href: "/", label: "Print desk" },
  { href: "/records", label: "Records" },
  { href: "/reprint", label: "Reprint" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <OperatorProvider>
      <TooltipProvider>
        <PrintProvider>
          <React.Suspense>
            <IntakeProvider>
              <div className="flex min-h-dvh flex-col">
                <TopBar />
                <main className="flex-1">{children}</main>
              </div>
              <BadgeViewer />
              <PageViewer />
              <JobPreview />
            </IntakeProvider>
          </React.Suspense>
        </PrintProvider>
        <Toaster />
      </TooltipProvider>
    </OperatorProvider>
  );
}

function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 focus-visible:outline-none">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-1 items-center justify-end gap-3">
          <QuickFind />
          <OperatorPicker />
        </div>
      </div>
    </header>
  );
}

/** A small stacked-sheet mark: four cards on a page, the thing this desk produces. */
function Wordmark() {
  return (
    <>
      <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden className="text-primary">
        <rect x="0.75" y="0.75" width="20.5" height="26.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 1v26M1 14h20" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 1.4" />
        <rect x="3.5" y="7" width="5" height="1.6" rx=".5" fill="currentColor" />
        <rect x="13.5" y="7" width="5" height="1.6" rx=".5" fill="currentColor" />
        <rect x="3.5" y="20" width="5" height="1.6" rx=".5" fill="currentColor" />
        <rect x="13.5" y="20" width="5" height="1.6" rx=".5" fill="currentColor" opacity=".35" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Badge Desk</span>
        <span className="mt-0.5 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">FGBMFI Convention</span>
      </span>
    </>
  );
}
