"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders page 1 of a badge PDF (or shows an image) at a given width.
 * Rendered pages are cached, and at most 3 render at once so long lists stay smooth.
 * `transparent` keeps the PDF background clear so it can sit over the card template.
 */

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

const cache = new Map<string, Promise<string>>();
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>) {
  if (active >= 3) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function renderToUrl(src: string, pxWidth: number, transparent: boolean): Promise<string> {
  return slot(async () => {
    const pdfjs = await loadPdfjs();
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Couldn't load file (${res.status})`);
    const data = new Uint8Array(await res.arrayBuffer());
    const task = pdfjs.getDocument({ data });
    const doc = await task.promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pxWidth / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      // pdf.js opens an opaque context by default, which turns a clear background black.
      const context = canvas.getContext("2d", { alpha: transparent });
      if (!context) throw new Error("Canvas not available");
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: transparent ? "rgba(0,0,0,0)" : "rgb(255,255,255)",
      }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("Couldn't draw the badge");
      return URL.createObjectURL(blob);
    } finally {
      await task.destroy();
    }
  });
}

export function useRenderedPdf(src: string | null, pxWidth: number, transparent = false) {
  const [state, setState] = React.useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  React.useEffect(() => {
    if (!src) return;
    let alive = true;
    const key = `${src}|${pxWidth}|${transparent ? 1 : 0}`;
    let p = cache.get(key);
    if (!p) {
      p = renderToUrl(src, pxWidth, transparent);
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    p.then(
      (url) => alive && setState({ url, error: null }),
      (err: unknown) => alive && setState({ url: null, error: err instanceof Error ? err.message : "Couldn't render" }),
    );
    return () => {
      alive = false;
    };
  }, [src, pxWidth, transparent]);
  return state;
}

type BadgeImageProps = {
  src: string;
  mimeType: string;
  /** Render resolution in CSS pixels (doubled for sharp screens). */
  width: number;
  transparent?: boolean;
  alt: string;
  className?: string;
};

/** A6 badge picture. Keeps the 105:148 shape while loading so layouts don't jump. */
export function BadgeImage({ src, mimeType, width, transparent = false, alt, className }: BadgeImageProps) {
  const isPdf = mimeType === "application/pdf";
  const { url, error } = useRenderedPdf(isPdf ? src : null, Math.round(width * 2), transparent);
  const shown = isPdf ? url : src;
  return (
    <div className={cn("relative aspect-[105/148] w-full overflow-hidden", !transparent && "bg-white", className)}>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt={alt} className="absolute inset-0 size-full object-contain" draggable={false} />
      ) : error ? (
        <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-destructive">{error}</div>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-muted/60" />
      )}
    </div>
  );
}

export function cardFileUrl(cardId: string) {
  return `/api/cards/${cardId}/file`;
}
export function stagingFileUrl(stagingId: string) {
  return `/api/intake/staging/${stagingId}`;
}
