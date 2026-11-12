"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster, TooltipProvider } from "@/components/ui/misc";
import { MenuIcon } from "@/components/icons";
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
  { href: "/queue", label: "Queue" },
  { href: "/records", label: "Records" },
  { href: "/reprint", label: "Reprint" },
  { href: "/reconcile", label: "Reconcile" },
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "Guide" },
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
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-3 sm:gap-6 sm:px-5">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none md:hidden"
          aria-label="Open menu"
        >
          <MenuIcon className="size-5" />
        </button>

        <Link href="/" className="flex min-w-0 shrink items-center gap-2.5 focus-visible:outline-none">
          <Wordmark compact />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-3">
          <QuickFind />
          <OperatorPicker />
        </div>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>
              <span className="flex items-center gap-2.5">
                <Wordmark />
              </span>
            </SheetTitle>
          </SheetHeader>
          <nav aria-label="Main" className="flex flex-col gap-1 p-3">
            {NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setNavOpen(false)} block />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function NavLink({
  item,
  pathname,
  onClick,
  block,
}: {
  item: (typeof NAV)[number];
  pathname: string;
  onClick?: () => void;
  block?: boolean;
}) {
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        block ? "w-full py-2.5" : "",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-card",
      )}
    >
      {item.label}
    </Link>
  );
}

/** A small stacked-sheet mark: four cards on a page, the thing this desk produces. */
function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <>
      <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden className="shrink-0 text-primary">
        <rect x="0.75" y="0.75" width="20.5" height="26.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 1v26M1 14h20" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 1.4" />
        <rect x="3.5" y="7" width="5" height="1.6" rx=".5" fill="currentColor" />
        <rect x="13.5" y="7" width="5" height="1.6" rx=".5" fill="currentColor" />
        <rect x="3.5" y="20" width="5" height="1.6" rx=".5" fill="currentColor" />
        <rect x="13.5" y="20" width="5" height="1.6" rx=".5" fill="currentColor" opacity=".35" />
      </svg>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">Badge Desk</span>
        <span className={cn("mt-0.5 truncate text-[10px] tracking-[0.1em] text-muted-foreground uppercase", compact && "hidden sm:block")}>
          FGBMFI Convention
        </span>
      </span>
    </>
  );
}
