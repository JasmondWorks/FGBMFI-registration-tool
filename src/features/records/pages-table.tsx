"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/events";
import { exactTime, PAGE_STATUS } from "@/lib/format";
import type { PageView } from "@/lib/types";
import { useOverlay } from "@/features/overlays/use-overlay";

const SIZE = 20;

/** Every sheet that has gone to the printer, originals and reprints, for auditing. */
export function PagesTable() {
  const overlay = useOverlay();
  const [status, setStatus] = React.useState("all");
  const [kind, setKind] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const qs = new URLSearchParams({ page: String(page), size: String(SIZE) });
  if (status !== "all") qs.set("status", status);
  if (kind !== "all") qs.set("kind", kind);
  const { data, loading } = useFetch(`pages?${qs}`, () => api<{ pages: PageView[]; total: number }>(`/api/pages?${qs}`));
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / SIZE));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-44" aria-label="Sheet status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {(["SENT", "SPOOLED", "CONFIRMED", "PARTIAL", "CANCELLED"] as const).map((s) => (
              <SelectItem key={s} value={s}>{PAGE_STATUS[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => { setKind(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40" aria-label="Sheet type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Originals and reprints</SelectItem>
            <SelectItem value="UPLOAD">Originals only</SelectItem>
            <SelectItem value="REPRINT">Reprints only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Sheet</TableHead>
              <TableHead>Badges</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Checked</TableHead>
              <TableHead>Printer job</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-7" /></TableCell></TableRow>
            ))}
            {data?.pages.length === 0 && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No sheets printed yet.</TableCell></TableRow>
            )}
            {data?.pages.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => overlay.open("page", p.id)}>
                <TableCell className="font-medium">
                  {p.jobKind === "REPRINT" ? "Reprint " : ""}#{p.pageNumber}
                  {p.jobReason && <span className="block text-xs font-normal text-muted-foreground">{p.jobReason}</span>}
                </TableCell>
                <TableCell className="max-w-md truncate whitespace-normal">
                  <span className="line-clamp-2 text-xs leading-5">{p.items.map((i) => `${i.slot}. ${i.card.fullName}${i.printed === false ? " (failed)" : ""}`).join("   ")}</span>
                </TableCell>
                <TableCell><Badge variant={PAGE_STATUS[p.status].tone}>{PAGE_STATUS[p.status].label}</Badge></TableCell>
                <TableCell className="tnum text-xs">{p.sentAt ? <>{exactTime(p.sentAt)}<span className="block text-muted-foreground">{p.sentBy}</span></> : "Not sent"}</TableCell>
                <TableCell className="tnum text-xs">{p.confirmedAt ? <>{exactTime(p.confirmedAt)}<span className="block text-muted-foreground">{p.confirmedBy}</span></> : "Not yet"}</TableCell>
                <TableCell className="font-mono text-xs">{p.spoolerJobId ?? (p.printMode === "BROWSER" ? "Browser" : "None")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="tnum text-muted-foreground">Page {page} of {pageCount}</span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((n) => n + 1)}>Next</Button>
      </div>
    </div>
  );
}
