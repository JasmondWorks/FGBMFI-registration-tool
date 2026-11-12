"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { personLabel } from "@/lib/format";
import type { CardSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One consistent row shape for every "search and pick a badge" surface — the queue, the
 * reprint builder, and the slot picker all used to render this slightly differently
 * (different rounding, padding, and subtitle format). Same shell everywhere now; each
 * surface only supplies what's actually different: the subtitle line and the trailing
 * content (a checkbox, a status badge, a button, a timestamp — whatever that flow needs).
 */
export function BadgeRow({
  card,
  index,
  selected,
  onToggle,
  subtitle,
  trailing,
  onClick,
  disabled,
}: {
  card: CardSummary;
  /** Row number, shown ahead of the name when the list order matters (e.g. the queue). */
  index?: number;
  /** When set (even to false), a checkbox renders and this controls it. */
  selected?: boolean;
  onToggle?: () => void;
  /** Defaults to chapter · district, falling back to the original filename. */
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const defaultSubtitle = [card.chapter, card.district].filter(Boolean).join(" · ") || card.originalFilename;
  const content = (
    <>
      {index !== undefined && <span className="tnum w-6 shrink-0 text-right text-xs text-muted-foreground">{index}</span>}
      {onToggle && <Checkbox checked={!!selected} onCheckedChange={onToggle} aria-label={`Select ${personLabel(card)}`} onClick={(e) => e.stopPropagation()} />}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-medium">{personLabel(card)}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle ?? defaultSubtitle}</span>
      </span>
      {trailing}
    </>
  );

  const className = "flex items-center gap-3 px-4 py-2.5";
  if (onClick) {
    return (
      <button type="button" disabled={disabled} onClick={onClick} className={cn(className, "w-full hover:bg-muted/50 disabled:opacity-60")}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

/** The shared list shell: same border, rounding and background everywhere. */
export function BadgeList({ children, as: As = "ul" }: { children: React.ReactNode; as?: "ul" | "ol" }) {
  return <As className="divide-y rounded-md border bg-card">{children}</As>;
}
