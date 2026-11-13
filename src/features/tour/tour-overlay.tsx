"use client";

import * as React from "react";

import { NAV } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-provider";

// On mobile the real sidebar is a Radix Sheet (its own focus-trapped portal) — fighting
// its open/close lifecycle from the tour caused real bugs: the callout could cover the
// very thing it pointed at, "Next" could take several taps before the Sheet's layer let
// the click through, and once the Sheet closed on its own the spotlight pointed at nothing.
// Simplest fix: for the two steps that live inside that drawer, draw our own static replica
// of it here, inside the tour's own top layer. Nothing to click, nothing to fight — "Next" is
// the only way through, which is what we want anyway.
const MOBILE_NAV_TARGETS: Record<string, string> = {
  "tour-nav-queue": "/queue",
  "tour-nav-records": "/records",
};

/** Spotlights the real element for the current step with a cutout + a callout pointing at it. */
export function TourOverlay() {
  const { state, steps, isMobile, next, back, skip } = useTour();
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const step = steps[state.step];
  const mobileDrawerStep = isMobile && step && step.target in MOBILE_NAV_TARGETS;

  React.useEffect(() => {
    if (!state.active || !step || mobileDrawerStep) return;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [state.active, step, mobileDrawerStep]);

  if (!state.active || !step) return null;

  const pad = 8;
  const box = !mobileDrawerStep && rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // On mobile the callout always docks to the bottom of the screen: a target near the top
  // (or, for the drawer replica, a target that doesn't really exist in the page) made
  // position-near-target math push the card partly off-screen.
  const calloutStyle: React.CSSProperties = isMobile
    ? { bottom: 16, left: 12, right: 12 }
    : {
        top: box ? (box.top + box.height + 220 < window.innerHeight ? box.top + box.height + 12 : Math.max(12, box.top - 160)) : 80,
        left: box ? Math.min(Math.max(12, box.left), window.innerWidth - 332) : 12,
      };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="App walkthrough">
      <svg className="absolute inset-0 size-full" style={{ pointerEvents: box ? "none" : "auto" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {box && <rect x={box.left} y={box.top} width={box.width} height={box.height} rx={10} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="oklch(0.2 0.01 60 / 0.55)" mask={mobileDrawerStep ? undefined : "url(#tour-mask)"} />
      </svg>
      {box && (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-primary transition-all duration-150"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      )}
      {mobileDrawerStep && <MockDrawer activeHref={MOBILE_NAV_TARGETS[step.target]} />}
      <div
        className={cn("absolute rounded-lg border bg-card p-4 shadow-xl transition-all duration-150", !isMobile && "w-80 max-w-[calc(100vw-24px)]")}
        style={calloutStyle}
      >
        <p className="text-xs font-medium text-muted-foreground">
          Step {state.step + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={skip} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
          <div className="flex gap-2">
            {state.step > 0 && (
              <Button size="sm" variant="outline" onClick={back}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={next} className={cn(state.step === 0 && "ml-auto")}>
              {state.step + 1 === steps.length ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A static, non-interactive replica of the mobile sidebar — just enough to show where things live. */
function MockDrawer({ activeHref }: { activeHref: string }) {
  return (
    <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col gap-1 border-r bg-card p-3 pt-16 shadow-2xl">
      {NAV.map((item) => (
        <div
          key={item.href}
          className={cn(
            "rounded-md px-3 py-2.5 text-sm transition-colors",
            item.href === activeHref ? "bg-foreground text-background ring-2 ring-primary ring-offset-2 ring-offset-card" : "text-muted-foreground",
          )}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
