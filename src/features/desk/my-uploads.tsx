"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { removeMyUploads, useMyUploads } from "@/lib/my-uploads";
import { describeSheetPosition } from "@/lib/paging";
import type { CardStatus } from "@/lib/types";

type CardStatusInfo = {
  id: string;
  fullName: string;
  status: CardStatus;
  printCount: number;
  queuePosition: number | null;
  queueTotal: number;
};

// Once a badge reaches one of these, this list has nothing further to tell about it —
// printed/given out is the happy ending, discarded/superseded means it's gone or been
// replaced. Pruned automatically rather than piling up as dead weight all shift.
const RESOLVED: CardStatus[] = ["PRINTED", "GIVEN_OUT", "DISCARDED", "SUPERSEDED"];

/**
 * An uploader has no login and no "my jobs" page — just a device that remembers what it
 * recently sent in. This is the one place that turns that into "still queued (and how
 * close to the front), built, printed, or given out" instead of a black box.
 */
export function MyUploads() {
  const [ids] = useMyUploads();
  const key = ids.length ? `my-uploads:${ids.join(",")}` : null;
  const { data } = useFetch(key, () => api<CardStatusInfo[]>(`/api/cards/status?ids=${ids.join(",")}`));

  // Drop resolved badges from the tracked list once their status is known — an external
  // store write triggered by data that just arrived, which is what an effect is for.
  React.useEffect(() => {
    if (!data) return;
    const resolved = data.filter((d) => RESOLVED.includes(d.status)).map((d) => d.id);
    if (resolved.length) removeMyUploads(resolved);
  }, [data]);

  if (ids.length === 0) {
    return (
      <p className="max-w-lg text-sm text-muted-foreground">
        Nothing uploaded from this device yet. Once you drop files in, they&apos;ll show up here with where they stand.
      </p>
    );
  }
  if (!data) return null;

  // Keep the device's own recency order (newest upload first) rather than re-sorting by
  // status, and hide anything already resolved without waiting on the prune above to land.
  const byId = new Map(data.map((d) => [d.id, d]));
  const rows = ids.map((id) => byId.get(id)).filter((d): d is CardStatusInfo => !!d && !RESOLVED.includes(d.status));

  if (rows.length === 0) {
    return (
      <p className="max-w-lg text-sm text-muted-foreground">
        Nothing outstanding from this device right now — everything uploaded has printed (or been removed).
      </p>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <h2 className="text-sm font-semibold">Your uploads from this device</h2>
      <ul className="max-h-80 divide-y overflow-y-auto rounded-md border bg-card">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="truncate text-sm font-medium">{r.fullName}</span>
            <StatusNote info={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Only ever shown for a row still in progress — resolved statuses (printed, given out,
// discarded, superseded) are filtered out of the list above before this renders at all.
function StatusNote({ info }: { info: CardStatusInfo }) {
  if (info.queuePosition !== null) {
    return (
      <Badge variant="info" className="shrink-0">
        {describeSheetPosition(info.queuePosition, info.queueTotal)}
      </Badge>
    );
  }
  switch (info.status) {
    case "ON_PAGE":
      return (
        <Badge variant="secondary" className="shrink-0">
          Built, not printed yet
        </Badge>
      );
    case "PRINT_SENT":
      return (
        <Badge variant="warning" className="shrink-0">
          Sent to printer
        </Badge>
      );
    default:
      return null;
  }
}
