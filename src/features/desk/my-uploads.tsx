"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { useMyUploads } from "@/lib/my-uploads";
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

/**
 * An uploader has no login and no "my jobs" page — just a device that remembers what it
 * recently sent in. This is the one place that turns that into "still queued (and how
 * close to the front), built, printed, or given out" instead of a black box.
 */
export function MyUploads() {
  const [ids] = useMyUploads();
  const key = ids.length ? `my-uploads:${ids.join(",")}` : null;
  const { data } = useFetch(key, () => api<CardStatusInfo[]>(`/api/cards/status?ids=${ids.join(",")}`));

  if (ids.length === 0) {
    return (
      <p className="max-w-lg text-sm text-muted-foreground">
        Nothing uploaded from this device yet. Once you drop files in, they&apos;ll show up here with where they stand.
      </p>
    );
  }
  if (!data) return null;

  // Keep the device's own recency order (newest upload first) rather than re-sorting by status.
  const byId = new Map(data.map((d) => [d.id, d]));
  const rows = ids.map((id) => byId.get(id)).filter((d): d is CardStatusInfo => !!d);

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <h2 className="text-sm font-semibold">Your uploads from this device</h2>
      <ul className="divide-y rounded-md border bg-card">
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
    case "PRINTED":
      return (
        <Badge variant="success" className="shrink-0">
          Printed
        </Badge>
      );
    case "GIVEN_OUT":
      return (
        <Badge variant="success" className="shrink-0">
          Given out
        </Badge>
      );
    case "DISCARDED":
      return (
        <Badge variant="outline" className="shrink-0">
          Removed
        </Badge>
      );
    case "SUPERSEDED":
      return (
        <Badge variant="outline" className="shrink-0">
          Replaced
        </Badge>
      );
    default:
      return null;
  }
}
