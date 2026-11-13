"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-provider";

/** Spotlights the real element for the current step with a cutout + a callout pointing at it. */
export function TourOverlay() {
  const { state, steps, next, back, skip } = useTour();
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const step = steps[state.step];

  React.useEffect(() => {
    if (!state.active || !step) return;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [state.active, step]);

  if (!state.active || !step) return null;

  function goNext() {
    // The next step (a nav link) lives inside the mobile drawer — open it first so that
    // step's target actually exists to spotlight, instead of showing a dim screen with
    // nothing highlighted.
    if (step!.target === "tour-hamburger") {
      (document.querySelector('[data-tour="tour-hamburger"]') as HTMLElement | null)?.click();
    }
    next();
  }

  const pad = 8;
  const box = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  // Place the callout below the target, or above it if there isn't room.
  const calloutTop = box ? (box.top + box.height + 220 < window.innerHeight ? box.top + box.height + 12 : Math.max(12, box.top - 160)) : 80;
  const calloutLeft = box ? Math.min(Math.max(12, box.left), window.innerWidth - 332) : 12;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="App walkthrough">
      <svg className="absolute inset-0 size-full" style={{ pointerEvents: box ? "none" : "auto" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {box && <rect x={box.left} y={box.top} width={box.width} height={box.height} rx={10} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="oklch(0.2 0.01 60 / 0.55)" mask="url(#tour-mask)" />
      </svg>
      {box && (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-primary transition-all duration-150"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      )}
      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-lg border bg-card p-4 shadow-xl transition-all duration-150"
        style={{ top: calloutTop, left: calloutLeft }}
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
            <Button size="sm" onClick={goNext} className={cn(state.step === 0 && "ml-auto")}>
              {state.step + 1 === steps.length ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
