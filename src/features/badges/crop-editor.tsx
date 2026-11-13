"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged } from "@/lib/events";
import type { CardSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cardFileUrl, useRenderedPdf } from "@/features/pdf/pdf-render";

type Rect = { x: number; y: number; w: number; h: number }; // percentages, 0-100, top-left origin

const DEFAULT_RECT: Rect = { x: 15, y: 60, w: 70, h: 30 }; // a reasonable starting guess: lower third, most of the width

/**
 * For a FULL_CARD badge (the whole card's artwork baked in, not a name-only overlay):
 * draw a box over the one useful region (the dynamic part — name, QR, ID) directly on the
 * real file, with a live preview showing exactly how it'll sit on the pre-printed stock.
 * There's no sample of this template to calibrate automatically, so this is done by eye,
 * once per badge (or once per upload batch, if they all share the same layout).
 */
export function CropEditor({ card, onSaved }: { card: CardSummary; onSaved?: () => void }) {
  const isPdf = card.mimeType === "application/pdf";
  const src = cardFileUrl(card.id);
  const rendered = useRenderedPdf(isPdf ? src : null, 900, false);
  const imgSrc = isPdf ? rendered.url : src;

  const toInitial = (): Rect => {
    if (!card.cropBox || !card.pageWidthPt || !card.pageHeightPt) return DEFAULT_RECT;
    const { x, y, width, height } = card.cropBox;
    const pw = card.pageWidthPt;
    const ph = card.pageHeightPt;
    // Stored box is PDF points, bottom-left origin; the editor works in top-left percentages.
    return { x: (x / pw) * 100, y: (1 - (y + height) / ph) * 100, w: (width / pw) * 100, h: (height / ph) * 100 };
  };
  const [rect, setRect] = React.useState<Rect>(toInitial);
  const [saving, setSaving] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);

  function clampRect(r: Rect): Rect {
    const w = Math.min(100, Math.max(5, r.w));
    const h = Math.min(100, Math.max(5, r.h));
    const x = Math.min(100 - w, Math.max(0, r.x));
    const y = Math.min(100 - h, Math.max(0, r.y));
    return { x, y, w, h };
  }

  function dragHandler(mode: "move" | "nw" | "ne" | "sw" | "se") {
    return (downEvent: React.PointerEvent) => {
      downEvent.preventDefault();
      downEvent.stopPropagation();
      const frame = frameRef.current;
      if (!frame) return;
      const bounds = frame.getBoundingClientRect();
      const start = { x: downEvent.clientX, y: downEvent.clientY };
      const startRect = rect;

      function onMove(e: PointerEvent) {
        const dxPct = ((e.clientX - start.x) / bounds.width) * 100;
        const dyPct = ((e.clientY - start.y) / bounds.height) * 100;
        let next = startRect;
        if (mode === "move") next = { ...startRect, x: startRect.x + dxPct, y: startRect.y + dyPct };
        if (mode === "se") next = { ...startRect, w: startRect.w + dxPct, h: startRect.h + dyPct };
        if (mode === "nw") next = { x: startRect.x + dxPct, y: startRect.y + dyPct, w: startRect.w - dxPct, h: startRect.h - dyPct };
        if (mode === "ne") next = { ...startRect, y: startRect.y + dyPct, w: startRect.w + dxPct, h: startRect.h - dyPct };
        if (mode === "sw") next = { ...startRect, x: startRect.x + dxPct, w: startRect.w - dxPct, h: startRect.h + dyPct };
        setRect(clampRect(next));
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  async function save() {
    if (!card.pageWidthPt || !card.pageHeightPt) {
      toast.error("This badge has no known page size — can't convert the crop to print coordinates.");
      return;
    }
    const pw = card.pageWidthPt;
    const ph = card.pageHeightPt;
    const cropBox = {
      x: (rect.x / 100) * pw,
      width: (rect.w / 100) * pw,
      height: (rect.h / 100) * ph,
      y: ph - ((rect.y + rect.h) / 100) * ph, // top-left % -> PDF bottom-left origin
    };
    setSaving(true);
    try {
      await api(`/api/cards/${card.id}/crop`, { method: "PATCH", json: cropBox });
      emitDeskChanged();
      toast.success("Crop saved — it'll print from just this region from now on");
      onSaved?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const handleCls = "absolute size-3 rounded-full border-2 border-primary bg-background shadow-sm";

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Drag the box over just the name / QR / ID area</p>
        <div ref={frameRef} className="relative w-full overflow-hidden rounded-md border bg-muted/30 select-none">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgSrc} alt="" className="pointer-events-none block w-full" draggable={false} />
          ) : (
            <div className="aspect-[105/148] w-full animate-pulse" />
          )}
          <div
            onPointerDown={dragHandler("move")}
            className="absolute cursor-move border-2 border-primary bg-primary/10"
            style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
          >
            <span onPointerDown={dragHandler("nw")} className={cn(handleCls, "-top-1.5 -left-1.5 cursor-nwse-resize")} />
            <span onPointerDown={dragHandler("ne")} className={cn(handleCls, "-top-1.5 -right-1.5 cursor-nesw-resize")} />
            <span onPointerDown={dragHandler("sw")} className={cn(handleCls, "-bottom-1.5 -left-1.5 cursor-nesw-resize")} />
            <span onPointerDown={dragHandler("se")} className={cn(handleCls, "-bottom-1.5 -right-1.5 cursor-nwse-resize")} />
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-40">
        <p className="text-xs font-medium text-muted-foreground">On the card</p>
        <div className="relative w-full overflow-hidden rounded-sm border bg-white" style={{ aspectRatio: "105 / 148" }}>
          {imgSrc && rect.w > 0 && rect.h > 0 && (
            <img
              src={imgSrc}
              alt=""
              className="absolute max-w-none"
              style={{
                width: `${(100 / rect.w) * 100}%`,
                left: `${-(rect.x / rect.w) * 100}%`,
                top: `${-(rect.y / rect.h) * 100}%`,
                height: `${(100 / rect.h) * 100}%`,
              }}
            />
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving || !imgSrc}>
          {saving ? "Saving..." : "Save crop"}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Approximate — print a calibration sheet after saving to check exact alignment on real stock.
        </p>
      </div>
    </div>
  );
}
