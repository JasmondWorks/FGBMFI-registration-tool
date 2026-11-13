"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { SheetGroupList, type CardStatusInfo } from "./sheet-group-list";

/**
 * Visibility into the shared queue isn't limited to what this device uploaded — anyone
 * should be able to look up a specific person and see exactly which sheet they're part
 * of (and who else is on it), from any device, any mode.
 */
export function QueueSearch() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 180);
    return () => window.clearTimeout(t);
  }, [q]);
  const key = debounced ? `queue-search:${debounced}` : null;
  const { data, loading } = useFetch(key, () => api<CardStatusInfo[]>(`/api/queue/search?q=${encodeURIComponent(debounced)}`));

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <h2 className="text-sm font-semibold">Find anyone in the queue</h2>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, chapter, district or ID" className="pl-9" />
      </div>
      {q.trim() &&
        (loading && !data ? (
          <p className="px-1 text-sm text-muted-foreground">Searching…</p>
        ) : data && data.length > 0 ? (
          <SheetGroupList items={data} />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">No one matching &ldquo;{q}&rdquo; is still waiting in the queue.</p>
        ))}
    </div>
  );
}
