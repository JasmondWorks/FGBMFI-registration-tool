import Link from "next/link";

import { Badge } from "@/components/ui/badge";

type Step = { n: number; title: string; body: string };
type PageCard = { href: string; label: string; tag: string; tone: "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info"; body: string; bullets: string[] };

const FLOW: Step[] = [
  { n: 1, title: "Upload", body: "Drop badge PDFs on the home page. Each one is read automatically and checked for duplicates." },
  { n: 2, title: "Queue", body: "New badges land in one shared queue — everyone's uploads, across the whole desk. Nothing prints until a full sheet of 4 is ready." },
  { n: 3, title: "Auto-print", body: "The moment the queue has 4 or more, a sheet builds itself and the print preview opens — no extra steps for a clean batch. Need specific names first? Search, select, and print or prioritize them from the Queue page." },
  { n: 4, title: "Confirm", body: "After printing, you're asked which badges actually came out. Only confirmed badges are marked printed." },
  { n: 5, title: "Records", body: "Every badge's full history lives on the Records page: printed, reprinted, by whom, when." },
];

const PAGES: PageCard[] = [
  {
    href: "/",
    label: "Print desk",
    tag: "Home",
    tone: "default",
    body: "Where every shift starts. Drop files here; today's stats and anything waiting for your attention show up below.",
    bullets: ["Drag-and-drop or click to choose files", "Shows sheets waiting for you to confirm", "Shows the waiting tray (held-back badges from an uneven upload)"],
  },
  {
    href: "/queue",
    label: "Queue",
    tag: "New",
    tone: "info",
    body: "Every badge uploaded anywhere that hasn't printed yet, in one list. This is where printing actually happens from.",
    bullets: [
      "Search and filter by district",
      "\"Build next sheet\" pulls the oldest 4 in line",
      "Search for specific names, select them, and \"Move to front\" — prioritizes them and prints immediately if that completes a sheet",
      "\"Print selected now\" prints an exact hand-picked set right away, any count, any order — offers to print underfilled rather than forcing a round number",
    ],
  },
  {
    href: "/records",
    label: "Records",
    tag: "Audit",
    tone: "secondary",
    body: "The full list of every badge ever uploaded, with filters, search, and export. The place to answer \"has this person's badge printed?\"",
    bullets: ["Filter by district, chapter, status, printed-by", "Click a badge to see its full history", "Export the current view to CSV"],
  },
  {
    href: "/reprint",
    label: "Reprint",
    tag: "Fix mistakes",
    tone: "warning",
    body: "Search for any badge (printed or not) and build a reprint batch with a reason — misprint, lost badge, name corrected, etc.",
    bullets: ["Works just like the queue: pick any badges, any order", "Needs a reason before it'll print", "Reprinted badges keep a full history of every version"],
  },
  {
    href: "/reconcile",
    label: "Verify prints",
    tag: "New",
    tone: "info",
    body: "Catch up badges that were printed but that the system doesn't know about — printed before tracking started, or printed elsewhere. Confirms print status only, not whether the badge reached its owner.",
    bullets: [
      "Take or choose photos of already-printed badges",
      "The app reads the name and ID off the card automatically",
      "Matches get marked printed; anything with no match needs its file uploaded once",
    ],
  },
  {
    href: "/settings",
    label: "Settings",
    tag: "Setup",
    tone: "secondary",
    body: "Printer choice and the alignment numbers that keep names landing in the right spot on the pre-printed cards.",
    bullets: [
      "Print a calibration sheet on plain paper to check alignment",
      "Separate offset for the bottom row if your printer drifts",
      "When printing multiple sheets, you'll be reminded to check \"two-sided\" is off — these cards are single-sided stock",
      "Danger zone: wipe all test data before the real event",
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-12 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Badge variant="info" className="w-fit">
          User guide
        </Badge>
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">How Badge Desk works</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Everything on this page is also just normal use of the app — nothing here needs to be memorized. Come back any time
          something feels unclear.
        </p>
      </header>

      {/* The main flow, as a visual timeline */}
      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">The normal flow, start to finish</h2>
        <div className="grid gap-4 sm:grid-cols-5">
          {FLOW.map((s, i) => (
            <div key={s.n} className="relative flex flex-col gap-2 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {s.n}
                </span>
                <span className="text-sm font-semibold">{s.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              {i < FLOW.length - 1 && (
                <span aria-hidden className="absolute top-1/2 -right-2.5 hidden -translate-y-1/2 text-muted-foreground sm:block">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Concept clarifier: queue vs tray vs records, since these look similar */}
      <section className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-5">
        <h2 className="text-lg font-semibold">Three lists that sound similar</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Queue</span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Badges not printed yet, waiting their turn. This is the one to check if you're wondering "what's left to print?"
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Waiting tray</span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              A small leftover: when an upload wasn't a multiple of 4, the extra 1-3 badges sit here until the next upload tops
              them up. It's a subset of the queue, not a separate thing to manage.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Records</span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Every badge, printed or not — the permanent, searchable history. The queue empties out as things print; Records
              never does.
            </p>
          </div>
        </div>
      </section>

      {/* Every page, as a visual card grid */}
      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Every page, what it's for</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="flex flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/20"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold">{p.label}</span>
                <Badge variant={p.tone}>{p.tag}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {p.bullets.map((b) => (
                  <li key={b} className="flex gap-1.5">
                    <span aria-hidden>·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">Good to know</h2>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>Pick who's at the desk from the top-right corner before uploading or printing — it's logged against every action.</li>
          <li>A sheet is always 4 badges. If a batch doesn't divide evenly, you'll be offered to add more, remove some, or hold the extras in the tray.</li>
          <li>The app never marks a badge printed on its own — you always confirm what actually came out of the printer.</li>
          <li>
            Printing more than one sheet from the browser: make sure "Two-sided printing" is off in the print dialog that opens, or
            sheet 2 will print on the back of sheet 1's single-sided card stock instead of its own sheet.
          </li>
          <li>Works on a phone or tablet too — the menu collapses behind the ☰ button at the top on a narrow screen.</li>
          <li>Testing things out? Settings → Danger zone (type &ldquo;DELETE EVERYTHING&rdquo; to confirm) clears all data so you can start clean before the real event.</li>
        </ul>
      </section>
    </div>
  );
}
