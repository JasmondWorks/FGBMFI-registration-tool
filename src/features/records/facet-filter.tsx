"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Option = { value: string; count: number; label?: string };

/** shadcn-style faceted filter: searchable options with counts, multi-select. */
export function FacetFilter({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  // Keep selected values visible even if the current filters gave them zero results.
  const merged: Option[] = [...options, ...selected.filter((s) => !options.some((o) => o.value === s)).map((s) => ({ value: s, count: 0 }))];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 border-dashed", selected.length > 0 && "border-solid border-primary/40 bg-accent/40")}>
          <PlusIcon className="size-3.5" />
          {title}
          {selected.length > 0 && (
            <span className="tnum ml-0.5 rounded-sm bg-primary px-1 text-[11px] text-primary-foreground">{selected.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {merged.map((o) => {
                const on = set.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label ?? o.value}
                    onSelect={() => onChange(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
                  >
                    <Checkbox checked={on} className="pointer-events-none" tabIndex={-1} />
                    <span className="flex-1 truncate">{o.label ?? o.value}</span>
                    <span className="tnum text-xs text-muted-foreground">{o.count}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Clear {title.toLowerCase()}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
