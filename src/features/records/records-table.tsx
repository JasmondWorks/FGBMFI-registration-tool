"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, MoreIcon, SearchIcon, SortIcon } from "@/components/icons";
import { api, errorMessage } from "@/lib/api";
import { emitDeskChanged, useFetch } from "@/lib/events";
import { CARD_STATUS, exactTime, FILTER_STATUS_LABELS, relativeTime, shortTime } from "@/lib/format";
import type { RecordsQuery } from "@/lib/records-query";
import type { CardSummary, Facets } from "@/lib/types";
import { createStoredStore } from "@/lib/stored-store";
import { cn, pluralize } from "@/lib/utils";
import { BadgeImage, cardFileUrl } from "@/features/pdf/pdf-render";
import { useOverlay } from "@/features/overlays/use-overlay";
import { addToReprintDraft, setReprintDraft } from "@/features/reprint/reprint-draft";
import { FacetFilter } from "./facet-filter";
import { useRecordsQuery } from "./use-records-query";

/** Selection is kept by badge id (not row index), so it survives search, filters and paging. */
const selectionStore = createStoredStore<string[]>("desk.recordsSelection", "session", []);
const visibilityStore = createStoredStore<VisibilityState>("desk.recordsColumns", "local", { registrationId: false, uploadedBy: false });

function useSelection() {
  const [ids] = selectionStore.useValue();
  const selected = React.useMemo(() => new Set(ids), [ids]);
  const update = React.useCallback((fn: (prev: Set<string>) => Set<string>) => {
    selectionStore.set((prev) => [...fn(new Set(prev))]);
  }, []);
  return [selected, update] as const;
}

export function RecordsTable() {
  const router = useRouter();
  const overlay = useOverlay();
  const { query, update, apiParams, activeCount, clear } = useRecordsQuery();
  const list = useFetch(`cards?${apiParams}`, () => api<{ rows: CardSummary[]; total: number }>(`/api/cards?${apiParams}`));
  const facets = useFetch(`facets?${apiParams}`, () => api<Facets>(`/api/cards/facets?${apiParams}`));
  const [selected, setSelected] = useSelection();
  const [visibility, setVisibility] = visibilityStore.useValue();
  const [search, setSearch] = React.useState(query.q);
  // Keep the box in step when the URL changes from elsewhere (clear filters, back button).
  const [urlQ, setUrlQ] = React.useState(query.q);
  if (query.q !== urlQ) {
    setUrlQ(query.q);
    setSearch(query.q);
  }
  // Debounced search into the URL.
  React.useEffect(() => {
    if (search === query.q) return;
    const t = window.setTimeout(() => update({ q: search }), 280);
    return () => window.clearTimeout(t);
  }, [search, query.q, update]);

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.size));
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));

  const columns = React.useMemo<ColumnDef<CardSummary>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        header: () => (
          <Checkbox
            aria-label="Select this page"
            checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of pageIds) {
                  if (v) next.add(id);
                  else next.delete(id);
                }
                return next;
              })
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.fullName}`}
            checked={selected.has(row.original.id)}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (v) next.add(row.original.id);
                else next.delete(row.original.id);
                return next;
              })
            }
          />
        ),
      },
      {
        id: "badge",
        header: "Badge",
        cell: ({ row }) => (
          <button onClick={() => overlay.open("view", row.original.id)} className="block w-[30px] overflow-hidden rounded-[2px] border focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none" aria-label={`Open ${row.original.fullName}`}>
            <BadgeImage src={cardFileUrl(row.original.id)} mimeType={row.original.mimeType} width={30} alt="" />
          </button>
        ),
      },
      {
        id: "title",
        header: "Title",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.titles.join(" ") || "None"}</span>,
      },
      {
        id: "name",
        header: () => <SortHeader label="Full name" field="name" query={query} update={update} />,
        enableHiding: false,
        cell: ({ row }) => (
          <button onClick={() => overlay.open("view", row.original.id)} className="flex items-center gap-2 text-left font-semibold hover:underline">
            {row.original.fullName}
            {row.original.needsReview && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="rounded-sm bg-warning-soft px-1 text-[10px] font-medium text-[oklch(0.45_0.1_65)]">Check</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{row.original.reviewReasons.join(" ")}</TooltipContent>
              </Tooltip>
            )}
          </button>
        ),
      },
      { id: "chapter", header: () => <SortHeader label="Chapter" field="chapter" query={query} update={update} />, cell: ({ row }) => row.original.chapter ?? <Dash /> },
      { id: "district", header: () => <SortHeader label="District" field="district" query={query} update={update} />, cell: ({ row }) => row.original.district ?? <Dash /> },
      {
        id: "registrationId",
        header: "Registration ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.registrationId ?? "None"}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const st = CARD_STATUS[row.original.status];
          return (
            <span className="flex items-center gap-1.5">
              <Badge variant={st.tone}>{st.label}</Badge>
              {row.original.printCount > 1 && <Badge variant="info">Reprinted</Badge>}
            </span>
          );
        },
      },
      {
        id: "printCount",
        header: () => <SortHeader label="Times" field="printCount" query={query} update={update} />,
        cell: ({ row }) => <span className={cn("tnum", row.original.printCount === 0 && "text-muted-foreground")}>{row.original.printCount}x</span>,
      },
      {
        id: "lastPrinted",
        header: () => <SortHeader label="Last printed" field="lastPrinted" query={query} update={update} />,
        cell: ({ row }) =>
          row.original.lastPrintedAt ? (
            <Tooltip>
              <TooltipTrigger className="tnum text-left">{relativeTime(row.original.lastPrintedAt)}</TooltipTrigger>
              <TooltipContent>{exactTime(row.original.lastPrintedAt)}</TooltipContent>
            </Tooltip>
          ) : (
            <Dash />
          ),
      },
      { id: "printedBy", header: "Printed by", cell: ({ row }) => row.original.lastPrintedBy ?? <Dash /> },
      {
        id: "generated",
        header: "Badge generated",
        cell: ({ row }) => <span className="tnum text-muted-foreground">{row.original.badgeGeneratedAt ? shortTime(row.original.badgeGeneratedAt) : "Unknown"}</span>,
      },
      { id: "uploadedBy", header: "Uploaded by", cell: ({ row }) => row.original.uploadedBy },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.fullName}`}>
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => overlay.open("view", row.original.id)}>View badge and history</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setReprintDraft({ cardIds: [row.original.id] });
                  router.push("/reprint");
                }}
              >
                Reprint
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  addToReprintDraft([row.original.id]);
                  toast.success(`${row.original.fullName} added to the reprint list`);
                }}
              >
                Add to reprint list
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(row.original.originalFilename);
                  toast.message("Filename copied");
                }}
              >
                Copy filename
              </DropdownMenuItem>
              {row.original.status !== "DISCARDED" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={async () => {
                      if (!window.confirm(`Delete ${row.original.fullName}'s badge? For a wrong upload or typo'd entry; it stays in the audit trail.`)) return;
                      try {
                        await api(`/api/cards/${row.original.id}`, { method: "DELETE" });
                        emitDeskChanged();
                        toast.success(`${row.original.fullName}'s badge was deleted`);
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  >
                    Delete badge
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, allOnPage, someOnPage, pageIds.join(","), query.sort],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (updater) => setVisibility((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    getRowId: (r) => r.id,
  });

  async function selectAllMatching() {
    try {
      const { ids } = await api<{ ids: string[] }>(`/api/cards?${apiParams}&idsOnly=1`);
      setSelected((prev) => new Set([...prev, ...ids]));
      toast.success(`${pluralize(ids.length, "badge")} selected`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const f = facets.data;
  const extraFacetKeys = Object.keys(f?.extra ?? {});

  return (
    <div className="flex flex-col gap-3 pb-24">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, chapter, ID, filename or badge text"
            className="h-8 pl-8"
            aria-label="Search records"
          />
        </div>
        <FacetFilter title="District" options={f?.district ?? []} selected={query.district} onChange={(v) => update({ district: v })} />
        <FacetFilter title="Chapter" options={f?.chapter ?? []} selected={query.chapter} onChange={(v) => update({ chapter: v })} />
        <FacetFilter
          title="Title"
          options={(f?.title ?? []).map((t) => ({ ...t, label: t.value.charAt(0) + t.value.slice(1).toLowerCase() }))}
          selected={query.title}
          onChange={(v) => update({ title: v })}
        />
        <FacetFilter
          title="Status"
          options={(f?.status ?? []).map((s) => ({ ...s, label: FILTER_STATUS_LABELS[s.value] ?? s.value }))}
          selected={query.status}
          onChange={(v) => update({ status: v })}
        />
        {(f?.printedBy.length ?? 0) > 0 && (
          <FacetFilter title="Printed by" options={f!.printedBy} selected={query.printedBy} onChange={(v) => update({ printedBy: v })} />
        )}
        {extraFacetKeys.length > 0 && (
          <span className="text-xs text-muted-foreground">Also on badges: {extraFacetKeys.join(", ")}</span>
        )}
        <DateRange query={query} update={update} />
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 border-dashed", query.review === "yes" && "border-solid border-primary/40 bg-accent/40")}
          onClick={() => update({ review: query.review === "yes" ? undefined : "yes" })}
          aria-pressed={query.review === "yes"}
        >
          Needs a check
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
            Clear filters
            <CloseIcon className="size-3.5" />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" asChild>
            <a href={`/api/cards/export?${apiParams}`}>Export CSV</a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                Columns <ChevronDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    {COLUMN_LABELS[c.id] ?? c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {query.q && <Chip label={`Search: ${query.q}`} onRemove={() => update({ q: "" })} />}
          {(["district", "chapter", "title", "status", "printedBy"] as const).flatMap((k) =>
            query[k].map((v) => (
              <Chip key={`${k}:${v}`} label={`${COLUMN_LABELS[k] ?? k}: ${k === "status" ? FILTER_STATUS_LABELS[v] ?? v : v}`} onRemove={() => update({ [k]: query[k].filter((x) => x !== v) })} />
            )),
          )}
          {query.review && <Chip label="Needs a check" onRemove={() => update({ review: undefined })} />}
          {(query.from || query.to) && <Chip label={`Printed ${query.from ?? "…"} to ${query.to ?? "…"}`} onRemove={() => update({ from: undefined, to: undefined })} />}
        </div>
      )}

      {/* Select-all-matching hint */}
      {allOnPage && total > rows.length && (
        <div className="rounded-md bg-accent/50 px-3 py-2 text-sm">
          All {rows.length} on this page are selected.{" "}
          <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={selectAllMatching}>
            Select all {total} matching
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {list.loading && rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={table.getVisibleLeafColumns().length}>
                    <Skeleton className="h-7" />
                  </TableCell>
                </TableRow>
              ))}
            {!list.loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="py-14 text-center">
                  <p className="text-sm font-medium">{activeCount ? "No badges match these filters" : "No badges uploaded yet"}</p>
                  {activeCount > 0 && (
                    <Button variant="link" size="sm" onClick={clear}>
                      Clear filters
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined} className={cn(list.loading && "opacity-60")}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="tnum text-muted-foreground">
          {total === 0 ? "0 badges" : `${(query.p - 1) * query.size + 1}–${Math.min(total, query.p * query.size)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Rows</Label>
          <Select value={String(query.size)} onValueChange={(v) => update({ size: Number(v) })}>
            <SelectTrigger className="h-8 w-[76px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="tnum px-2 text-muted-foreground">
            Page {query.p} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={query.p <= 1} onClick={() => update({ p: query.p - 1 }, { keepPage: true })}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={query.p >= pageCount} onClick={() => update({ p: query.p + 1 }, { keepPage: true })}>
            Next
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-lg border bg-foreground py-2 pr-2 pl-4 text-background shadow-xl">
            <span className="tnum text-sm">{pluralize(selected.size, "badge")} selected</span>
            <button className="text-sm text-background/70 underline-offset-4 hover:text-background hover:underline" onClick={() => setSelected(() => new Set())}>
              Clear
            </button>
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/cards/export?ids=${[...selected].join(",")}`}>Export selected</a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                addToReprintDraft([...selected]);
                setSelected(() => new Set());
                router.push("/reprint");
              }}
            >
              Reprint selected
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const COLUMN_LABELS: Record<string, string> = {
  badge: "Badge",
  title: "Title",
  chapter: "Chapter",
  district: "District",
  registrationId: "Registration ID",
  status: "Status",
  printCount: "Times printed",
  lastPrinted: "Last printed",
  printedBy: "Printed by",
  generated: "Badge generated",
  uploadedBy: "Uploaded by",
};

function Dash() {
  return <span className="text-muted-foreground">None</span>;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-2.5">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <CloseIcon className="size-3" />
      </button>
    </span>
  );
}

function SortHeader({
  label,
  field,
  query,
  update,
}: {
  label: string;
  field: string;
  query: RecordsQuery;
  update: (p: Partial<RecordsQuery>) => void;
}) {
  const active = query.sort.replace(/^-/, "") === field;
  const desc = query.sort.startsWith("-");
  return (
    <button
      className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", active && "text-foreground")}
      onClick={() => update({ sort: (active && !desc ? `-${field}` : field) as RecordsQuery["sort"] })}
    >
      {label}
      {active ? desc ? <ChevronDownIcon className="size-3" /> : <ChevronUpIcon className="size-3" /> : <SortIcon className="size-3 opacity-50" />}
    </button>
  );
}

function DateRange({ query, update }: { query: RecordsQuery; update: (p: Partial<RecordsQuery>) => void }) {
  const [from, setFrom] = React.useState(query.from ?? "");
  const [to, setTo] = React.useState(query.to ?? "");
  const urlRange = `${query.from ?? ""}|${query.to ?? ""}`;
  const [seenRange, setSeenRange] = React.useState(urlRange);
  if (urlRange !== seenRange) {
    setSeenRange(urlRange);
    setFrom(query.from ?? "");
    setTo(query.to ?? "");
  }
  const active = !!(query.from || query.to);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 border-dashed", active && "border-solid border-primary/40 bg-accent/40")}>
          Printed date
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            update({ from: from || undefined, to: to || undefined });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="from" className="text-xs">
                From
              </Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="to" className="text-xs">
                To
              </Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            {active && (
              <Button type="button" size="sm" variant="ghost" onClick={() => update({ from: undefined, to: undefined })}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
