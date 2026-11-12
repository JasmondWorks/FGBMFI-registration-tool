"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOperator } from "./operator-context";

/** Who is at the desk. Every upload, print and reprint is recorded against this name. */
export function OperatorPicker() {
  const { operator, ready, setOperator, pickerOpen, setPickerOpen } = useOperator();
  const [draft, setDraft] = React.useState("");
  const [recent, setRecent] = React.useState<string[]>([]);

  const [wasOpen, setWasOpen] = React.useState(pickerOpen);
  if (pickerOpen !== wasOpen) {
    setWasOpen(pickerOpen);
    if (pickerOpen) {
      setDraft(operator);
      setRecent(readRecent().filter((r) => r !== operator));
    }
  }

  // First visit: ask straight away.
  React.useEffect(() => {
    if (ready && !operator) setPickerOpen(true);
  }, [ready, operator, setPickerOpen]);

  function save(name: string) {
    if (!name.trim()) return;
    setOperator(name);
    setPickerOpen(false);
  }

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex h-9 items-center gap-2.5 rounded-md border border-transparent px-2.5 text-left transition-colors hover:border-border hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {operator ? operator.charAt(0).toUpperCase() : "?"}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">At the desk</span>
            <span className="text-sm font-medium">{ready ? operator || "Choose operator" : ""}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(draft);
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="operator-name">Your name</Label>
            <p className="text-xs text-muted-foreground">Uploads, prints and reprints are logged against this name.</p>
          </div>
          <Input id="operator-name" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Tola Adeyemi" />
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <Button key={r} type="button" variant="outline" size="sm" onClick={() => save(r)}>
                  {r}
                </Button>
              ))}
            </div>
          )}
          <Button type="submit" disabled={!draft.trim()}>
            Start shift
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem("desk.recentOperators") ?? "[]") as string[];
  } catch {
    return [];
  }
}
