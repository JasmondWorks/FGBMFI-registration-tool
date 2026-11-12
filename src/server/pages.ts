import "server-only";

import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { CARDS_PER_PAGE, checkCount, chunkIntoPages } from "@/lib/paging";
import type { JobView, PageView } from "@/lib/types";
import { logEvents, type AuditInput } from "./audit";
import { db, type Tx } from "./db";
import { cards, jobs, pageItems, pages, type Card } from "./db/schema";
import { UserError } from "./http";
import { toCardSummary } from "./mappers";

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export async function getPageViews(pageIds: string[]): Promise<PageView[]> {
  if (pageIds.length === 0) return [];
  const rows = await db
    .select({ page: pages, job: jobs })
    .from(pages)
    .innerJoin(jobs, eq(jobs.id, pages.jobId))
    .where(inArray(pages.id, pageIds));
  const items = await db
    .select({ item: pageItems, card: cards })
    .from(pageItems)
    .innerJoin(cards, eq(cards.id, pageItems.cardId))
    .where(inArray(pageItems.pageId, pageIds))
    .orderBy(asc(pageItems.slot));

  const byPage = new Map<string, PageView["items"]>();
  for (const { item, card } of items) {
    const list = byPage.get(item.pageId) ?? [];
    list.push({ itemId: item.id, slot: item.slot, printed: item.printed, card: toCardSummary(card) });
    byPage.set(item.pageId, list);
  }
  const order = new Map(pageIds.map((id, i) => [id, i]));
  return rows
    .map(({ page, job }) => ({
      id: page.id,
      jobId: page.jobId,
      jobKind: job.kind,
      jobReason: job.reason,
      pageNumber: page.pageNumber,
      status: page.status,
      isUnderfilled: page.isUnderfilled,
      printMode: page.printMode,
      printerName: page.printerName,
      spoolerJobId: page.spoolerJobId,
      sentBy: page.sentBy,
      confirmedBy: page.confirmedBy,
      createdAt: page.createdAt.toISOString(),
      sentAt: page.sentAt?.toISOString() ?? null,
      confirmedAt: page.confirmedAt?.toISOString() ?? null,
      items: byPage.get(page.id) ?? [],
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function getJobView(jobId: string): Promise<JobView> {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) throw new UserError("That job no longer exists", 404);
  const pageRows = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.jobId, jobId), notInArray(pages.status, ["CANCELLED"])))
    .orderBy(asc(pages.pageNumber));
  const pageViews = await getPageViews(pageRows.map((p) => p.id));
  const unplaced =
    job.kind === "UPLOAD"
      ? await db.query.cards.findMany({
          where: and(eq(cards.jobId, jobId), eq(cards.status, "UPLOADED")),
          orderBy: [asc(cards.createdAt)],
        })
      : [];
  return {
    id: job.id,
    kind: job.kind,
    operator: job.operator,
    reason: job.reason,
    createdAt: job.createdAt.toISOString(),
    pages: pageViews,
    unplaced: unplaced.map(toCardSummary),
  };
}

/* ------------------------------------------------------------------ */
/* Layout: (re)builds the READY pages of a job, 4 badges per sheet      */
/* ------------------------------------------------------------------ */

export type LayoutOptions = {
  /** Explicit order for the cards still waiting to print (e.g. after a drag reorder). */
  order?: string[];
  /** Badges to add to this job (reprints, or filling gaps from the tray). */
  addCardIds?: string[];
  /** Remove these from the job. Upload jobs discard them; reprint jobs just drop them. */
  removeCardIds?: string[];
  /** Hold these in the waiting tray for the next upload (new badges only). */
  holdCardIds?: string[];
  /** Print a last page with fewer than 4 badges. Logged as an override. */
  allowUnderfilled?: boolean;
};

export type LayoutResult =
  | { ok: true; job: JobView }
  | { ok: false; needsCountFix: true; total: number; remainder: number; missing: number; job: JobView };

export async function layoutJob(jobId: string, opts: LayoutOptions, operator: string): Promise<LayoutResult> {
  const outcome = await db.transaction(async (tx) => {
    const job = await tx.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
    if (!job) throw new UserError("That job no longer exists", 404);
    const events: AuditInput[] = [];

    // 1. Current queue: cards on READY pages (page, slot order) then unplaced cards (upload order).
    const readyPages = await tx.select().from(pages).where(and(eq(pages.jobId, jobId), eq(pages.status, "READY")));
    const readyPageIds = readyPages.map((p) => p.id);
    const onPages = readyPageIds.length
      ? await tx
          .select({ cardId: pageItems.cardId, pageNumber: pages.pageNumber, slot: pageItems.slot })
          .from(pageItems)
          .innerJoin(pages, eq(pages.id, pageItems.pageId))
          .where(inArray(pageItems.pageId, readyPageIds))
          .orderBy(asc(pages.pageNumber), asc(pageItems.slot))
      : [];
    const onPageCardIds = new Set(onPages.map((r) => r.cardId));
    let queue = onPages.map((r) => r.cardId);
    if (job.kind === "UPLOAD") {
      const unplaced = await tx
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.jobId, jobId), eq(cards.status, "UPLOADED")))
        .orderBy(asc(cards.createdAt));
      queue.push(...unplaced.map((u) => u.id));
    }
    for (const id of opts.addCardIds ?? []) queue.push(id);
    queue = [...new Set(queue)];

    if (opts.order?.length) {
      const pos = new Map(opts.order.map((id, i) => [id, i]));
      queue.sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9));
    }

    // 2. Removals and holds.
    const remove = new Set(opts.removeCardIds ?? []);
    const hold = new Set(opts.holdCardIds ?? []);
    const queueCards = queue.length ? await tx.select().from(cards).where(inArray(cards.id, queue)) : [];
    const byId = new Map(queueCards.map((c) => [c.id, c]));
    for (const id of hold) {
      const c = byId.get(id);
      if (c && c.printCount > 0) throw new UserError(`${c.fullName} has been printed before, so it can't go to the waiting tray`);
    }
    const finalQueue = queue.filter((id) => !remove.has(id) && !hold.has(id) && byId.has(id));
    const blocked = finalQueue.map((id) => byId.get(id)!).find((c) => c.status === "DISCARDED" || c.status === "SUPERSEDED");
    if (blocked) throw new UserError(`${blocked.fullName}'s badge was ${blocked.status === "DISCARDED" ? "removed" : "replaced by a newer version"}`);
    // A card already on a DIFFERENT job's unconfirmed page got there between when this
    // request read the queue and now (two uploads/prints landing at the same moment).
    // Block it rather than silently double-booking the same badge onto two sheets.
    const raced = finalQueue
      .map((id) => byId.get(id)!)
      .find((c) => (c.status === "ON_PAGE" || c.status === "PRINT_SENT") && !onPageCardIds.has(c.id));
    if (raced) throw new UserError(`${raced.fullName}'s badge was just placed on another sheet. Refresh and try again.`);

    // 3. Enforce the multiple-of-4 rule before changing anything.
    const count = checkCount(finalQueue.length);
    if (finalQueue.length > 0 && !count.ok && !opts.allowUnderfilled) {
      return { ok: false as const, total: count.total, remainder: count.remainder, missing: count.missing };
    }

    // 4. Apply removals / holds.
    if (remove.size > 0) {
      const ids = [...remove].filter((id) => byId.has(id));
      if (job.kind === "UPLOAD" && ids.length) {
        await tx.update(cards).set({ status: "DISCARDED", updatedAt: new Date() }).where(and(inArray(cards.id, ids), eq(cards.printCount, 0)));
        // Printed badges that were added to an upload job just go back to PRINTED.
        await tx.update(cards).set({ status: "PRINTED", updatedAt: new Date() }).where(and(inArray(cards.id, ids), sql`${cards.printCount} > 0`));
        for (const id of ids) events.push({ type: "DISCARDED", actor: operator, cardId: id, jobId, payload: { fullName: byId.get(id)?.fullName } });
      } else if (ids.length) {
        await restoreStatus(tx, ids);
      }
    }
    if (hold.size > 0) {
      const ids = [...hold].filter((id) => byId.has(id));
      if (ids.length) {
        await tx.update(cards).set({ status: "WAITING_TRAY", jobId: null, updatedAt: new Date() }).where(inArray(cards.id, ids));
        events.push({ type: "MOVED_TO_TRAY", actor: operator, jobId, payload: { cardIds: ids, names: ids.map((i) => byId.get(i)?.fullName) } });
      }
    }

    // 5. Rebuild READY pages.
    if (readyPageIds.length) await tx.delete(pages).where(inArray(pages.id, readyPageIds));
    const [{ maxNo }] = await tx
      .select({ maxNo: sql<number>`coalesce(max(${pages.pageNumber}), 0)` })
      .from(pages)
      .where(eq(pages.jobId, jobId));

    const chunks = chunkIntoPages(finalQueue);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const underfilled = chunk.length < CARDS_PER_PAGE;
      const [page] = await tx
        .insert(pages)
        .values({ jobId, pageNumber: Number(maxNo) + i + 1, isUnderfilled: underfilled })
        .returning();
      await tx.insert(pageItems).values(chunk.map((cardId, k) => ({ pageId: page.id, cardId, slot: k + 1 })));
      if (underfilled) {
        events.push({ type: "UNDERFILLED_OVERRIDE", actor: operator, pageId: page.id, jobId, payload: { badges: chunk.length } });
      }
    }
    if (chunks.length) {
      events.push({ type: "PAGE_CREATED", actor: operator, jobId, payload: { pages: chunks.length, badges: finalQueue.length } });
    }

    // New badges on a page are ON_PAGE. Previously printed badges keep PRINTED (their history shows the reprint).
    if (finalQueue.length) {
      await tx
        .update(cards)
        .set({ status: "ON_PAGE", updatedAt: new Date() })
        .where(and(inArray(cards.id, finalQueue), inArray(cards.status, ["UPLOADED", "WAITING_TRAY"])));
    }

    await logEvents(events, tx);
    return { ok: true as const };
  });

  const job = await getJobView(jobId);
  if (!outcome.ok) return { ...outcome, needsCountFix: true, job };
  return { ok: true, job };
}

/** Puts cards that are leaving a page back into the right resting status. */
async function restoreStatus(tx: Tx, cardIds: string[]) {
  if (!cardIds.length) return;
  await tx
    .update(cards)
    .set({ status: sql`case when ${cards.printCount} > 0 then 'PRINTED'::card_status else 'UPLOADED'::card_status end`, updatedAt: new Date() })
    .where(and(inArray(cards.id, cardIds), inArray(cards.status, ["ON_PAGE", "PRINT_SENT"])));
}

/** Swap two badges between slots (on the same or different READY pages). */
export async function swapSlots(a: { pageId: string; slot: number }, b: { pageId: string; slot: number }, operator: string) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ item: pageItems, page: pages })
      .from(pageItems)
      .innerJoin(pages, eq(pages.id, pageItems.pageId))
      .where(inArray(pageItems.pageId, [a.pageId, b.pageId]));
    const ia = rows.find((r) => r.item.pageId === a.pageId && r.item.slot === a.slot);
    const ib = rows.find((r) => r.item.pageId === b.pageId && r.item.slot === b.slot);
    if (!ia || !ib) throw new UserError("Both slots must have a badge");
    if (ia.page.status !== "READY" || ib.page.status !== "READY") throw new UserError("Only pages that haven't been printed can be rearranged");
    await tx.update(pageItems).set({ cardId: ib.item.cardId }).where(eq(pageItems.id, ia.item.id));
    await tx.update(pageItems).set({ cardId: ia.item.cardId }).where(eq(pageItems.id, ib.item.id));
    await logEvents([{ type: "PAGE_CREATED", actor: operator, pageId: a.pageId, payload: { action: "swap", a, b } }], tx);
  });
}

/* ------------------------------------------------------------------ */
/* Printing lifecycle                                                  */
/* ------------------------------------------------------------------ */

export async function assertPrintable(pageIds: string[]) {
  const views = await getPageViews(pageIds);
  if (views.length !== pageIds.length) throw new UserError("Some pages no longer exist. Refresh and try again.");
  for (const v of views) {
    if (v.items.length !== CARDS_PER_PAGE && !v.isUnderfilled) {
      throw new UserError(`Page ${v.pageNumber} has ${v.items.length} badges. Every sheet needs 4.`);
    }
    if (v.items.length === 0) throw new UserError(`Page ${v.pageNumber} is empty`);
  }
  return views;
}

export async function markSent(
  pageIds: string[],
  operator: string,
  mode: "BROWSER" | "DIRECT",
  extra?: { printerName?: string | null; spooler?: Record<string, string> },
) {
  await assertPrintable(pageIds);
  await db.transaction(async (tx) => {
    const now = new Date();
    for (const pageId of pageIds) {
      await tx
        .update(pages)
        .set({
          status: "SENT",
          sentAt: now,
          sentBy: operator,
          printMode: mode,
          printerName: extra?.printerName ?? null,
          spoolerJobId: extra?.spooler?.[pageId] ?? null,
          confirmedAt: null,
          confirmedBy: null,
        })
        .where(eq(pages.id, pageId));
    }
    const items = await tx.select().from(pageItems).where(inArray(pageItems.pageId, pageIds));
    await tx.update(pageItems).set({ printed: null }).where(inArray(pageItems.pageId, pageIds));
    await tx
      .update(cards)
      .set({ status: "PRINT_SENT", updatedAt: now })
      .where(and(inArray(cards.id, items.map((i) => i.cardId)), eq(cards.status, "ON_PAGE")));
    await logEvents(
      pageIds.map((pageId) => ({
        type: "PRINT_SENT" as const,
        actor: operator,
        pageId,
        payload: { mode, printer: extra?.printerName ?? null, spoolerJobId: extra?.spooler?.[pageId] ?? null, cardIds: items.filter((i) => i.pageId === pageId).map((i) => i.cardId) },
      })),
      tx,
    );
  });
}

export async function markSpooled(pageId: string, spoolerJobId: string) {
  const [page] = await db
    .update(pages)
    .set({ status: "SPOOLED" })
    .where(and(eq(pages.id, pageId), eq(pages.status, "SENT")))
    .returning();
  if (page) await logEvents([{ type: "PRINT_SPOOLED", actor: "print-agent", pageId, payload: { spoolerJobId } }]);
}

export type ConfirmInput = { pageId: string; printedItemIds: string[]; failedItemIds: string[] };

/** The operator's answer to "did these print correctly?". This is what marks badges PRINTED. */
export async function confirmPages(input: ConfirmInput[], operator: string) {
  await db.transaction(async (tx) => {
    const now = new Date();
    const events: AuditInput[] = [];
    for (const p of input) {
      const page = await tx.query.pages.findFirst({ where: eq(pages.id, p.pageId) });
      if (!page) continue;
      if (page.status !== "SENT" && page.status !== "SPOOLED") {
        throw new UserError(`Page ${page.pageNumber} isn't waiting for confirmation`);
      }
      const items = await tx.select().from(pageItems).where(eq(pageItems.pageId, p.pageId));
      const printed = items.filter((i) => p.printedItemIds.includes(i.id));
      const failed = items.filter((i) => !p.printedItemIds.includes(i.id));

      if (printed.length) {
        await tx.update(pageItems).set({ printed: true }).where(inArray(pageItems.id, printed.map((i) => i.id)));
        await tx
          .update(cards)
          .set({
            status: sql`case when ${cards.status} in ('DISCARDED','SUPERSEDED') then ${cards.status} else 'PRINTED'::card_status end`,
            printCount: sql`${cards.printCount} + 1`,
            firstPrintedAt: sql`coalesce(${cards.firstPrintedAt}, ${now.toISOString()}::timestamptz)`,
            lastPrintedAt: now,
            lastPrintedBy: operator,
            updatedAt: now,
          })
          .where(inArray(cards.id, printed.map((i) => i.cardId)));
      }
      if (failed.length) {
        await tx.update(pageItems).set({ printed: false }).where(inArray(pageItems.id, failed.map((i) => i.id)));
        await restoreStatus(tx, failed.map((i) => i.cardId));
      }
      await tx
        .update(pages)
        .set({ status: failed.length === 0 ? "CONFIRMED" : printed.length === 0 ? "CANCELLED" : "PARTIAL", confirmedAt: now, confirmedBy: operator })
        .where(eq(pages.id, p.pageId));

      for (const i of printed) events.push({ type: "PRINT_CONFIRMED", actor: operator, cardId: i.cardId, pageId: p.pageId, payload: { slot: i.slot, mode: page.printMode, spoolerJobId: page.spoolerJobId } });
      for (const i of failed) events.push({ type: "PRINT_FAILED", actor: operator, cardId: i.cardId, pageId: p.pageId, payload: { slot: i.slot } });
    }
    await logEvents(events, tx);
  });
}

/** "Nothing printed": put the pages back to READY so they can be printed again. */
export async function cancelSent(pageIds: string[], operator: string) {
  await db.transaction(async (tx) => {
    const items = await tx.select().from(pageItems).where(inArray(pageItems.pageId, pageIds));
    await tx
      .update(pages)
      .set({ status: "READY", sentAt: null, sentBy: null, spoolerJobId: null })
      .where(and(inArray(pages.id, pageIds), inArray(pages.status, ["SENT", "SPOOLED"])));
    await tx
      .update(cards)
      .set({ status: "ON_PAGE", updatedAt: new Date() })
      .where(and(inArray(cards.id, items.map((i) => i.cardId)), eq(cards.status, "PRINT_SENT")));
    await logEvents(pageIds.map((pageId) => ({ type: "PRINT_CANCELLED" as const, actor: operator, pageId })), tx);
  });
}

/* ------------------------------------------------------------------ */
/* Reprints                                                            */
/* ------------------------------------------------------------------ */

export async function createReprintJob(input: { cardIds: string[]; reason: string; operator: string }) {
  const unique = [...new Set(input.cardIds)];
  if (unique.length === 0) throw new UserError("Choose at least one badge to reprint");
  const found = await db.query.cards.findMany({ where: inArray(cards.id, unique) });
  const bad = found.find((c) => c.status === "DISCARDED");
  if (bad) throw new UserError(`${bad.fullName}'s badge was removed and can't be reprinted`);
  const busy = found.find((c) => c.status === "ON_PAGE" || c.status === "PRINT_SENT");
  if (busy) throw new UserError(`${busy.fullName} is already on a page waiting to print`);

  const [job] = await db.insert(jobs).values({ kind: "REPRINT", operator: input.operator, reason: input.reason }).returning();
  await logEvents(
    unique.map((cardId) => ({ type: "REPRINT_REQUESTED" as const, actor: input.operator, cardId, jobId: job.id, payload: { reason: input.reason } })),
  );
  return job.id;
}

/** Badges in the waiting tray, oldest first. */
export async function getTray(): Promise<Card[]> {
  return db.query.cards.findMany({ where: eq(cards.status, "WAITING_TRAY"), orderBy: [asc(cards.createdAt)] });
}

export async function clearTray(operator: string) {
  const rows = await db
    .update(cards)
    .set({ status: "UPLOADED", jobId: null, updatedAt: new Date() })
    .where(eq(cards.status, "WAITING_TRAY"))
    .returning({ id: cards.id });
  if (rows.length) await logEvents([{ type: "TRAY_CLEARED", actor: operator, payload: { cardIds: rows.map((r) => r.id) } }]);
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Desk overview                                                       */
/* ------------------------------------------------------------------ */

export async function getDeskOverview() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [counts] = await db
    .select({
      uploadedToday: sql<number>`count(*) filter (where ${cards.createdAt} >= ${startOfDay.toISOString()}::timestamptz)`,
      printedToday: sql<number>`count(*) filter (where ${cards.lastPrintedAt} >= ${startOfDay.toISOString()}::timestamptz)`,
      printedTotal: sql<number>`count(*) filter (where ${cards.printCount} > 0 and ${cards.status} <> 'DISCARDED')`,
      notPrinted: sql<number>`count(*) filter (where ${cards.printCount} = 0 and ${cards.status} in ('UPLOADED','ON_PAGE','PRINT_SENT','WAITING_TRAY'))`,
      needsReview: sql<number>`count(*) filter (where ${cards.needsReview} and ${cards.status} not in ('DISCARDED','SUPERSEDED'))`,
      cloudFailed: sql<number>`count(*) filter (where ${cards.cloudStatus} = 'FAILED')`,
    })
    .from(cards);

  const waiting = await db
    .select({ id: pages.id })
    .from(pages)
    .where(inArray(pages.status, ["SENT", "SPOOLED"]))
    .orderBy(asc(pages.sentAt));
  const recent = await db
    .select({ id: pages.id })
    .from(pages)
    .where(notInArray(pages.status, ["READY"]))
    .orderBy(desc(sql`coalesce(${pages.confirmedAt}, ${pages.sentAt}, ${pages.createdAt})`))
    .limit(6);
  const openJobs = await db
    .select({ id: jobs.id, kind: jobs.kind, createdAt: jobs.createdAt, ready: sql<number>`count(${pages.id})` })
    .from(jobs)
    .innerJoin(pages, and(eq(pages.jobId, jobs.id), eq(pages.status, "READY")))
    .groupBy(jobs.id)
    .orderBy(desc(jobs.createdAt))
    .limit(5);
  const unplacedJobs = await db
    .select({ id: jobs.id, count: sql<number>`count(${cards.id})` })
    .from(jobs)
    .innerJoin(cards, and(eq(cards.jobId, jobs.id), eq(cards.status, "UPLOADED")))
    .where(eq(jobs.kind, "UPLOAD"))
    .groupBy(jobs.id)
    .orderBy(desc(jobs.createdAt))
    .limit(5);
  const tray = await getTray();

  return {
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])) as Record<keyof typeof counts, number>,
    waiting: await getPageViews(waiting.map((w) => w.id)),
    recent: await getPageViews(recent.map((r) => r.id)),
    openJobs: openJobs.map((j) => ({ id: j.id, kind: j.kind, createdAt: j.createdAt.toISOString(), readyPages: Number(j.ready) })),
    unplacedJobs: unplacedJobs.map((j) => ({ id: j.id, count: Number(j.count) })),
    tray: tray.map(toCardSummary),
  };
}

export async function listPages(opts: { status?: string; kind?: string; limit: number; offset: number }) {
  const where = and(
    opts.status ? eq(pages.status, opts.status as PageView["status"]) : notInArray(pages.status, ["READY"]),
    opts.kind ? eq(jobs.kind, opts.kind as "UPLOAD" | "REPRINT") : undefined,
  );
  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .innerJoin(jobs, eq(jobs.id, pages.jobId))
    .where(where)
    .orderBy(desc(sql`coalesce(${pages.sentAt}, ${pages.createdAt})`))
    .limit(opts.limit)
    .offset(opts.offset);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(pages)
    .innerJoin(jobs, eq(jobs.id, pages.jobId))
    .where(where);
  return { pages: await getPageViews(rows.map((r) => r.id)), total: Number(total) };
}
