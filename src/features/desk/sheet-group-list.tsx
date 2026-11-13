"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { describeSheetPosition } from "@/lib/paging";
import type { CardStatus } from "@/lib/types";

export type CardStatusInfo = {
  id: string;
  fullName: string;
  status: CardStatus;
  printCount: number;
  queuePosition: number | null;
  queueTotal: number;
  groupKey: string;
  sheetNames: string[];
};

/** Resolved badges (printed, given out, discarded, superseded) have nothing left to track. */
export const RESOLVED_STATUSES: CardStatus[] = ["PRINTED", "GIVEN_OUT", "DISCARDED", "SUPERSEDED"];

/**
 * One row per sheet, not per badge — nothing prints alone, so "visibility into the queue"
 * has to mean the actual group of 4 a badge rides on, with everyone sharing it, same as
 * the names-joined-by-commas treatment already used for "Built, not printed" and "Confirm
 * what printed". Shared by the uploader's own tracker and the queue search below.
 */
export function SheetGroupList({ items }: { items: CardStatusInfo[] }) {
  const groups = new Map<string, CardStatusInfo[]>();
  for (const it of items) groups.set(it.groupKey, [...(groups.get(it.groupKey) ?? []), it]);

  return (
    <ul className="divide-y rounded-md border bg-card">
      {[...groups.values()].map((members) => {
        const rep = members[0];
        return (
          <li key={rep.groupKey} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="truncate text-sm font-medium">{rep.sheetNames.join(", ")}</span>
            <StatusNote info={rep} />
          </li>
        );
      })}
    </ul>
  );
}

/** Only ever shown for a row still in progress — call sites filter resolved statuses out first. */
export function StatusNote({ info }: { info: CardStatusInfo }) {
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
