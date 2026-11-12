"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/events";
import type { PrintSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePrint } from "@/features/print/print-provider";

type Printer = { name: string; isDefault: boolean };

export function SettingsForm() {
  const { data, error } = useFetch("settings", () => api<PrintSettings>("/api/settings"));
  const printers = useFetch("printers", () => api<Printer[]>("/api/printers"));
  const { reloadSettings, printCalibration } = usePrint();
  const [form, setForm] = React.useState<PrintSettings | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [loaded, setLoaded] = React.useState<PrintSettings | null>(null);
  if (data && data !== loaded) {
    setLoaded(data);
    setForm(data);
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!form) return <Skeleton className="h-96" />;

  const set = <K extends keyof PrintSettings>(k: K, v: PrintSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  async function save() {
    if (!form) return;
    if (form.printMode === "DIRECT" && !form.printerName) {
      toast.error("Choose a printer for direct printing");
      return;
    }
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", json: form });
      await reloadSettings();
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex max-w-3xl flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Section title="How sheets are printed">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["BROWSER", "Browser print dialog", "Works everywhere. You choose the printer each time and the app asks what printed."],
              ["DIRECT", "Direct to printer (recommended)", "Sends each sheet straight to the printer and reads the print queue, so every sheet has a printer job number in the audit log."],
            ] as const
          ).map(([value, title, detail]) => (
            <label key={value} className={cn("flex cursor-pointer gap-3 rounded-md border p-3", form.printMode === value ? "border-primary bg-accent/40" : "hover:bg-muted/50")}>
              <input type="radio" name="mode" className="mt-1 accent-[var(--primary)]" checked={form.printMode === value} onChange={() => set("printMode", value)} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs leading-5 text-muted-foreground">{detail}</span>
              </span>
            </label>
          ))}
        </div>
        {form.printMode === "DIRECT" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="printer">Printer</Label>
            {printers.loading && !printers.data ? (
              <Skeleton className="h-9" />
            ) : (printers.data ?? []).length === 0 ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">No printers found on this computer. Install the printer, then reload this page.</p>
            ) : (
              <Select value={form.printerName ?? undefined} onValueChange={(v) => set("printerName", v)}>
                <SelectTrigger id="printer" className="max-w-md">
                  <SelectValue placeholder="Choose the badge printer" />
                </SelectTrigger>
                <SelectContent>
                  {printers.data!.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                      {p.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delay">Ask what printed after</Label>
          <div className="flex items-center gap-2">
            <Input id="delay" type="number" min={2} max={120} value={form.confirmDelaySec} onChange={(e) => set("confirmDelaySec", Number(e.target.value))} className="w-24" />
            <span className="text-sm text-muted-foreground">seconds (browser mode)</span>
          </div>
        </div>
      </Section>

      <Section title="Lining up with the pre-printed cards" hint="If names land a little off on the real cards, nudge them here. Print the calibration sheet on plain paper and hold it against a card sheet to check.">
        <div className="grid grid-cols-3 gap-4">
          <NumberField id="ox" label="Move right (mm)" value={form.offsetXmm} step={0.5} onChange={(v) => set("offsetXmm", v)} />
          <NumberField id="oy" label="Move down (mm)" value={form.offsetYmm} step={0.5} onChange={(v) => set("offsetYmm", v)} />
          <NumberField id="sc" label="Scale (%)" value={form.scalePct} step={0.5} onChange={(v) => set("scalePct", v)} />
        </div>
        <NumberField
          id="oy2"
          label="Bottom row (cards 3 & 4): extra move up (mm)"
          value={-form.offsetYmmRow2}
          step={0.5}
          onChange={(v) => set("offsetYmmRow2", -v)}
        />
        <p className="text-xs text-muted-foreground">
          On top of the offset above. Printers often drift more on the trailing edge of the sheet, so if the bottom two
          cards print lower than the top two, nudge this up.
        </p>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={form.printTemplate} onCheckedChange={(v) => set("printTemplate", !!v)} className="mt-0.5" />
          <span>
            Print the card artwork too
            <span className="block text-xs text-muted-foreground">For test prints on plain paper only. Turn it off for the real pre-printed cards.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={form.cutMarks} onCheckedChange={(v) => set("cutMarks", !!v)} className="mt-0.5" />
          <span>
            Small cut marks at the sheet edges
            <span className="block text-xs text-muted-foreground">Only useful when cutting plain sheets.</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => printCalibration()} disabled={dirty}>
            Print calibration sheet
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href="/api/print/calibration" target="_blank" rel="noreferrer">
              Open it as PDF
            </a>
          </Button>
          {dirty && <span className="self-center text-xs text-muted-foreground">Save first to print with these values.</span>}
        </div>
      </Section>

      {form.printTemplate && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
          Card artwork printing is on. Remember to switch it off before printing on the real cards.
        </p>
      )}

      <div className="sticky bottom-4 flex gap-2">
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? "Saving..." : "Save settings"}
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" onClick={() => setForm(data)}>
            Discard changes
          </Button>
        )}
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="max-w-2xl text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
      <Separator className="mt-2" />
    </section>
  );
}

function NumberField({ id, label, value, step, onChange }: { id: string; label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="tnum" />
    </div>
  );
}
