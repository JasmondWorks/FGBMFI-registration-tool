"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { CARD_STATUS, personLabel } from "@/lib/format";
import type { CardSummary } from "@/lib/types";
import { SearchIcon } from "@/components/icons";
import { useOverlay } from "@/features/overlays/use-overlay";
import { addToReprintDraft } from "@/features/reprint/reprint-draft";

/** Ctrl+K / Cmd+K from any screen: find a badge by name, chapter, ID or filename. */
export function QuickFind() {
  const overlay = useOverlay();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<CardSummary[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!q.trim()) return;
    let alive = true;
    const t = window.setTimeout(() => {
      api<CardSummary[]>(`/api/cards/find?q=${encodeURIComponent(q)}`)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  function onQuery(value: string) {
    setQ(value);
    setLoading(!!value.trim());
    if (!value.trim()) setResults([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find a badge"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-xs transition-colors hover:border-input focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none min-[1100px]:w-full min-[1100px]:max-w-72 min-[1100px]:justify-start min-[1100px]:gap-2 min-[1100px]:px-3"
      >
        <SearchIcon />
        <span className="hidden flex-1 text-left min-[1100px]:inline">Find a badge</span>
        <span className="hidden min-[1100px]:inline">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput value={q} onValueChange={onQuery} placeholder="Name, chapter, district, registration ID or filename" />
        <CommandList>
          {loading && results.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>}
          {q.trim() && !loading && results.length === 0 && <CommandEmpty>No badges match &ldquo;{q}&rdquo;.</CommandEmpty>}
          {results.length > 0 && (
            <CommandGroup heading="Badges">
              {results.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    setOpen(false);
                    overlay.open("view", c.id);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{personLabel(c)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[c.chapter, c.district].filter(Boolean).join(" · ")}
                      {c.printCount > 0 ? ` · printed ${c.printCount}x` : ""}
                    </span>
                  </span>
                  <Badge variant={CARD_STATUS[c.status].tone}>{CARD_STATUS[c.status].label}</Badge>
                  <button
                    type="button"
                    className="rounded-sm px-1.5 py-0.5 text-xs text-primary hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToReprintDraft([c.id]);
                      toast.success(`${c.fullName} added to the reprint list`);
                    }}
                  >
                    + Reprint list
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!q.trim() && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Start typing to search every uploaded badge.</p>}
        </CommandList>
      </CommandDialog>
    </>
  );
}
