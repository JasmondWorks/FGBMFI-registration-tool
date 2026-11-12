"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged } from "@/lib/events";
import type { CardSummary } from "@/lib/types";

/**
 * Fix a badge's recorded details (for search and audit). This does not change what is
 * printed: the badge file from the platform prints as issued.
 */
export function SlotEditor({ card, onSaved }: { card: CardSummary; onSaved?: () => void }) {
  const [titles, setTitles] = React.useState(card.titles.join(" "));
  const [name, setName] = React.useState(card.fullName);
  const [chapter, setChapter] = React.useState(card.chapter ?? "");
  const [district, setDistrict] = React.useState(card.district ?? "");
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();

  // Refill the form when a different badge (or fresher data) comes in.
  const [source, setSource] = React.useState(card);
  if (card !== source) {
    setSource(card);
    setTitles(card.titles.join(" "));
    setName(card.fullName);
    setChapter(card.chapter ?? "");
    setDistrict(card.district ?? "");
  }

  const dirty =
    titles !== card.titles.join(" ") || name !== card.fullName || chapter !== (card.chapter ?? "") || district !== (card.district ?? "");

  async function save(markReviewed: boolean) {
    setBusy(true);
    try {
      await api(`/api/cards/${card.id}`, {
        method: "PATCH",
        json: {
          fullName: name,
          titles: titles.split(/\s+/).filter(Boolean),
          chapter: chapter || null,
          district: district || null,
          markReviewed,
        },
      });
      emitDeskChanged();
      onSaved?.();
      toast.success("Details saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save(card.needsReview);
      }}
    >
      {card.needsReview && card.reviewReasons.length > 0 && (
        <ul className="rounded-md bg-warning-soft px-3 py-2 text-xs leading-5">
          {card.reviewReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[88px_1fr] gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-t`} className="text-xs text-muted-foreground">
            Titles
          </Label>
          <Input id={`${id}-t`} value={titles} onChange={(e) => setTitles(e.target.value)} className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-n`} className="text-xs text-muted-foreground">
            Full name
          </Label>
          <Input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-c`} className="text-xs text-muted-foreground">
            Chapter
          </Label>
          <Input id={`${id}-c`} value={chapter} onChange={(e) => setChapter(e.target.value)} className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-d`} className="text-xs text-muted-foreground">
            District
          </Label>
          <Input id={`${id}-d`} value={district} onChange={(e) => setDistrict(e.target.value)} className="h-8" />
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">Edits update the records only. The badge prints as issued by the platform.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || (!dirty && !card.needsReview)}>
          {card.needsReview ? "Save and mark checked" : "Save"}
        </Button>
        {card.needsReview && !dirty && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save(true)}>
            Looks right
          </Button>
        )}
      </div>
    </form>
  );
}
