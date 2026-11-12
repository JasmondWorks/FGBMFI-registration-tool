"use client";

import * as React from "react";

import type { CardSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { personLabel } from "@/lib/format";
import { BadgeImage, cardFileUrl } from "@/features/pdf/pdf-render";

/**
 * True-to-scale A4 sheet (210 x 297 mm). The pre-printed card artwork is shown underneath
 * for reference only (the paper already has it); the badge data is rendered with a
 * transparent background exactly where it will print. Calibration offsets are applied
 * so what you see is what the printer gets.
 */

export type SheetSlotItem = { slot: number; card: CardSummary; printed?: boolean | null };

type SheetViewProps = {
  items: SheetSlotItem[];
  showTemplate?: boolean;
  offsetXmm?: number;
  offsetYmm?: number;
  /** Rough on-screen width, used to pick the render resolution. */
  renderWidth?: number;
  selectedSlot?: number | null;
  onSlotClick?: (slot: number) => void;
  className?: string;
};

export function SheetView({
  items,
  showTemplate = true,
  offsetXmm = 0,
  offsetYmm = 0,
  renderWidth = 520,
  selectedSlot,
  onSlotClick,
  className,
}: SheetViewProps) {
  const bySlot = new Map(items.map((i) => [i.slot, i]));
  const shift = { transform: `translate(${(offsetXmm / 210) * 100}%, ${(offsetYmm / 297) * 100}%)` };

  return (
    <div className={cn("a4-sheet relative w-full overflow-hidden select-none", className)}>
      {showTemplate && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/template/a4-template.jpg" alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full object-fill" />
      )}
      <div className="absolute inset-0" style={shift}>
        {[1, 2, 3, 4].map((slot) => {
          const item = bySlot.get(slot);
          const col = (slot - 1) % 2;
          const row = Math.floor((slot - 1) / 2);
          const selected = selectedSlot === slot;
          const interactive = !!onSlotClick && !!item;
          return (
            <div
              key={slot}
              className="absolute"
              style={{ left: `${col * 50}%`, top: `${row * 50}%`, width: "50%", height: "50%" }}
            >
              {item ? (
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onSlotClick?.(slot)}
                  aria-label={`Slot ${slot}: ${personLabel(item.card)}`}
                  className={cn(
                    "group absolute inset-x-0 top-0 block w-full text-left outline-none",
                    interactive && "cursor-pointer",
                  )}
                  style={{ height: `${(148 / 148.5) * 100}%` }}
                >
                  <BadgeImage
                    src={cardFileUrl(item.card.id)}
                    mimeType={item.card.mimeType}
                    width={renderWidth / 2}
                    transparent
                    alt=""
                    className="h-full"
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-[3%] rounded-[3px] ring-2 transition-[box-shadow]",
                      selected ? "ring-primary" : "ring-transparent",
                      interactive && !selected && "group-hover:ring-primary/35 group-focus-visible:ring-primary/60",
                    )}
                  />
                  <span className="tnum absolute top-[2.5%] left-[3%] rounded-sm bg-foreground/80 px-1 text-[10px] leading-4 font-medium text-background">
                    {slot}
                  </span>
                  {item.card.needsReview && (
                    <span className="absolute top-[2.5%] right-[3%] rounded-sm bg-warning px-1 text-[10px] leading-4 font-medium text-white">
                      Check
                    </span>
                  )}
                  {item.printed === false && (
                    <span className="absolute inset-x-[3%] bottom-[12%] rounded-sm bg-destructive/90 py-0.5 text-center text-[10px] font-medium text-white">
                      Failed print
                    </span>
                  )}
                </button>
              ) : (
                <div className="absolute inset-[4%] flex items-center justify-center rounded-sm border border-dashed border-foreground/25 bg-background/70 text-[11px] text-muted-foreground">
                  Empty slot
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
