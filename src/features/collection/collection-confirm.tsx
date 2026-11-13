"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/icons";
import { api, errorMessage } from "@/lib/api";
import { CARD_STATUS, personLabel } from "@/lib/format";
import type { CardSummary } from "@/lib/types";
import { BadgeList, BadgeRow } from "@/features/badges/badge-row";
import { useOperator } from "@/features/operator/operator-context";

/**
 * The whole job of a Collection-mode device: find the person, confirm their badge is
 * actually the one in hand, and mark it handed over. Deliberately not the full badge
 * viewer — nothing here about reprinting, editing, or the print pipeline at all.
 */
export function CollectionConfirm() {
  const { requireOperator } = useOperator();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<CardSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [picked, setPicked] = React.useState<CardSummary | null>(null);
  const [busy, setBusy] = React.useState(false);

  function onQuery(value: string) {
    setQ(value);
    setLoading(!!value.trim());
  }

  React.useEffect(() => {
    // Stale results from a previous query just don't render — the list below is gated
    // on q.trim() too, so there's nothing to clear here.
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

  async function markGivenOut() {
    if (!picked || !requireOperator()) return;
    setBusy(true);
    try {
      const updated = await api<CardSummary>(`/api/cards/${picked.id}/given-out`, { method: "POST" });
      setPicked(updated);
      toast.success(`${updated.fullName}'s badge marked given out`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!picked || !requireOperator()) return;
    setBusy(true);
    try {
      const updated = await api<CardSummary>(`/api/cards/${picked.id}/given-out`, { method: "DELETE" });
      setPicked(updated);
      toast.message(`Undone — ${updated.fullName}'s badge is back to printed, not given out`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPicked(null);
    setQ("");
    setResults([]);
  }

  if (picked) {
    const status = CARD_STATUS[picked.status];
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-5 rounded-xl border bg-card p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
            {[picked.titles.join(" ")].filter(Boolean).join(" ")}
          </span>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">{personLabel(picked)}</h2>
          <p className="text-sm text-muted-foreground">{[picked.chapter, picked.district].filter(Boolean).join(" · ") || "No district or chapter"}</p>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>

        {picked.status === "PRINTED" && (
          <Button size="lg" disabled={busy} onClick={markGivenOut}>
            {busy ? "Marking..." : "Mark badge as given out"}
          </Button>
        )}
        {picked.status === "GIVEN_OUT" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-success">Already given out.</p>
            <Button variant="outline" disabled={busy} onClick={undo}>
              {busy ? "Undoing..." : "Undo — wrong person, or marked by mistake"}
            </Button>
          </div>
        )}
        {picked.status !== "PRINTED" && picked.status !== "GIVEN_OUT" && (
          <p className="text-center text-sm text-warning">
            This badge isn&apos;t confirmed printed yet ({status.label.toLowerCase()}) — nothing to hand out.
          </p>
        )}

        <Button variant="ghost" onClick={reset}>
          Search another name
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Find their badge</h1>
        <p className="text-sm text-muted-foreground">Search by name to confirm it before handing it over.</p>
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Name, chapter, district or ID" className="pl-9" />
      </div>
      {q.trim() && (
        <BadgeList>
          {loading && results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No badges match &ldquo;{q}&rdquo;.</li>
          ) : (
            results.map((c) => (
              <BadgeRow key={c.id} card={c} onClick={() => setPicked(c)} trailing={<Badge variant={CARD_STATUS[c.status].tone}>{CARD_STATUS[c.status].label}</Badge>} />
            ))
          )}
        </BadgeList>
      )}
    </div>
  );
}
