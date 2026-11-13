"use client";

import * as React from "react";

import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { removeMyUploads, useMyUploads } from "@/lib/my-uploads";
import { RESOLVED_STATUSES, SheetGroupList, type CardStatusInfo } from "./sheet-group-list";

/**
 * An uploader has no login and no "my jobs" page — just a device that remembers what it
 * recently sent in. This is the one place that turns that into "still queued (as part of
 * which sheet, with who else), built, printed, or given out" instead of a black box.
 */
export function MyUploads() {
  const [ids] = useMyUploads();
  const key = ids.length ? `my-uploads:${ids.join(",")}` : null;
  const { data } = useFetch(key, () => api<CardStatusInfo[]>(`/api/cards/status?ids=${ids.join(",")}`));

  // Drop resolved badges from the tracked list once their status is known — an external
  // store write triggered by data that just arrived, which is what an effect is for.
  React.useEffect(() => {
    if (!data) return;
    const resolved = data.filter((d) => RESOLVED_STATUSES.includes(d.status)).map((d) => d.id);
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

  // Hide anything already resolved without waiting on the prune above to land.
  const rows = data.filter((d) => !RESOLVED_STATUSES.includes(d.status));

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
      <div className="max-h-80 overflow-y-auto rounded-md">
        <SheetGroupList items={rows} />
      </div>
    </div>
  );
}
