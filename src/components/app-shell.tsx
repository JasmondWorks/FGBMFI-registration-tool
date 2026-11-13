"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster, TooltipProvider } from "@/components/ui/misc";
import { MenuIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ModeFromUrl } from "@/lib/mode-from-url";
import { queryClient } from "@/lib/query-client";
import { useMode, type DeskMode } from "@/lib/use-mode";
import { IntakeProvider } from "@/features/intake/intake-provider";
import { OperatorProvider } from "@/features/operator/operator-context";
import { OperatorPicker } from "@/features/operator/operator-picker";
import { JobPreview } from "@/features/preview/job-preview";
import { ReprintOverlay } from "@/features/reprint/reprint-overlay";
import { PrintProvider } from "@/features/print/print-provider";
import { UnconfirmedIndicator } from "@/features/print/unconfirmed-indicator";
import { QuickFind } from "@/features/quick-find/quick-find";
import { TourOverlay } from "@/features/tour/tour-overlay";
import { TourProvider, useTour } from "@/features/tour/tour-provider";
import { BadgeViewer } from "@/features/viewer/badge-viewer";
import { PageViewer } from "@/features/viewer/page-viewer";

export const NAV: { href: string; label: string; tourId?: string }[] = [
  { href: "/", label: "Print desk" },
  { href: "/queue", label: "Queue", tourId: "tour-nav-queue" },
  { href: "/records", label: "Records", tourId: "tour-nav-records" },
  { href: "/reprint", label: "Reprint" },
  { href: "/reconcile", label: "Verify prints" },
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "Guide" },
];

// A device set to Uploader has nothing to do with the print pipeline at all — just
// dropping files and checking whether someone's badge is in and printed yet.
const UPLOADER_NAV: typeof NAV = [{ href: "/", label: "Upload" }, { href: "/records", label: "Records" }];
// Collection is a dedicated "hand the badge over" station — same minimal shape as
// Uploader, just centered on confirming pickup instead of intake.
const COLLECTION_NAV: typeof NAV = [{ href: "/", label: "Collection" }, { href: "/records", label: "Records" }];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mode] = useMode();
  const isPrinter = mode === "printer";

  return (
    <QueryClientProvider client={queryClient}>
      <OperatorProvider>
        <TooltipProvider>
          <PrintProvider>
            <React.Suspense>
              <ModeFromUrl />
              <IntakeProvider>
                <TourProvider>
                  <div className="flex min-h-dvh flex-col">
                    <TopBar mode={mode} />
                    <main className="flex-1">
                      <RouteGuard mode={mode} />
                      {children}
                    </main>
                  </div>
                  <BadgeViewer />
                  {/* Printer-only surfaces: a device set to Uploader never sees the print
                      pipeline, so these can't pop open and interrupt someone mid-upload. */}
                  {isPrinter && <PageViewer />}
                  {isPrinter && <JobPreview />}
                  {isPrinter && <ReprintOverlay />}
                  <TourOverlay />
                </TourProvider>
              </IntakeProvider>
            </React.Suspense>
          </PrintProvider>
          <Toaster />
        </TooltipProvider>
      </OperatorProvider>
    </QueryClientProvider>
  );
}

// Printer-only pages (the print pipeline). Not just hidden from nav — a bookmarked link
// or a typed URL shouldn't be able to land an Uploader device on them either.
const PRINTER_ONLY_PREFIXES = ["/queue", "/reprint", "/reconcile", "/settings"];

function RouteGuard({ mode }: { mode: DeskMode }) {
  const pathname = usePathname();
  const router = useRouter();
  React.useEffect(() => {
    if (mode !== "printer" && PRINTER_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      router.replace("/");
    }
  }, [mode, pathname, router]);
  return null;
}

function TopBar({ mode }: { mode: DeskMode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);
  const nav = mode === "printer" ? NAV : mode === "collection" ? COLLECTION_NAV : UPLOADER_NAV;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-[2px]">
      {/* Three real regions, not one flat row fighting over space: a fixed-width left
          (menu + logo) and right (actions) cluster that never shrink, with the nav in
          between given the leftover space — and permission to scroll itself horizontally
          rather than ever overlapping its neighbors if that leftover space runs out. */}
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-3 sm:gap-4 sm:px-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            data-tour="tour-hamburger"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none min-[1280px]:hidden"
            aria-label="Open menu"
          >
            <MenuIcon className="size-5" />
          </button>

          <Link href="/" className="flex min-w-0 shrink items-center gap-2.5 focus-visible:outline-none">
            <Wordmark compact />
          </Link>

          {/* Below 1280px the real switcher lives in the sidebar, not the topbar — but
              which mode this device is in should still be visible at a glance without
              opening that drawer, and a one-word pill costs almost no width to do it. */}
          <span className="hidden shrink-0 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize min-[400px]:inline min-[1280px]:hidden">
            {mode}
          </span>
        </div>

        <nav
          aria-label="Main"
          className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none min-[1280px]:flex"
        >
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2.5">
          {mode === "printer" && <UnconfirmedIndicator />}
          <div className="hidden min-[1280px]:block">
            <ModeSwitcher />
          </div>
          <ReplayTourButton />
          <div data-tour="tour-quickfind">
            <QuickFind />
          </div>
          <div data-tour="tour-operator">
            <OperatorPicker />
          </div>
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
          <div className="flex flex-col gap-4 p-3">
            <ModeSwitcher />
            <nav aria-label="Main" className="flex flex-col gap-1">
              {nav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setNavOpen(false)} block />
              ))}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

/** Which interface this device shows — a per-device setting, not per-operator (see use-mode.ts). */
function ModeSwitcher() {
  const [mode, setMode] = useMode();
  return (
    <div role="radiogroup" aria-label="Device mode" className="flex items-center rounded-md border bg-card p-0.5 text-xs font-medium">
      {(["uploader", "printer", "collection"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "rounded-sm px-2.5 py-1.5 capitalize transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
            mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m}
        </button>
      ))}
    </div>
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
      data-tour={item.tourId}
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

function ReplayTourButton() {
  const { start } = useTour();
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Replay the app walkthrough"
      title="Replay the app walkthrough"
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      ?
    </button>
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
