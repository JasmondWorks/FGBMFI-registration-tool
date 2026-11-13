import "server-only";

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { CARDS_PER_PAGE } from "@/lib/paging";
import { normalizeText } from "@/lib/badge/normalize";
import { db } from "./db";
import { cards, jobs, pageItems, pages, type Card } from "./db/schema";
import { toCardSummary } from "./mappers";
import { layoutJob } from "./pages";
import { UserError } from "./http";

/**
 * The print queue: every badge uploaded anywhere that hasn't been placed on a page yet,
 * across every upload. Dedup already happened at intake (duplicates never reach this
 * state), so everything here is a unique badge waiting its turn. Sort is by queueRank
 * (manual priority) first, falling back to upload order (FIFO) for anything untouched.
 */

export type QueueQuery = {
  q: string;
  p: number;
  size: number;
};

function buildWhere(q: QueueQuery): SQL | undefined {
  const parts: (SQL | undefined)[] = [inArray(cards.status, ["UPLOADED", "WAITING_TRAY"])];
  const words = normalizeText(q.q).split(" ").filter(Boolean).slice(0, 8);
  for (const w of words) parts.push(sql`${cards.searchText} like ${"%" + w + "%"}`);
  return and(...parts);
}

const ORDER = [sql`${cards.queueRank} asc nulls last`, asc(cards.createdAt), asc(cards.id)];

export async function listQueue(q: QueueQuery) {
  const where = buildWhere(q);
  const rows = await db
    .select()
    .from(cards)
    .where(where)
    .orderBy(...ORDER)
    .limit(q.size)
    .offset((q.p - 1) * q.size);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(cards).where(where);
  return { rows: rows.map(toCardSummary), total: Number(total) };
}

/** Search the shared queue by name/chapter/district/ID, with each match's sheet grouping — for
 *  anyone (any device, any mode) looking up a specific person rather than just their own uploads. */
export async function searchQueueWithStatus(q: string, limit = 20): Promise<CardStatusInfo[]> {
  if (!q.trim()) return [];
  const { rows } = await listQueue({ q, p: 1, size: limit });
  return getCardStatuses(rows.map((r) => r.id));
}

export async function getQueueCount() {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(cards)
    .where(inArray(cards.status, ["UPLOADED", "WAITING_TRAY"]));
  return Number(total);
}

export type CardStatusInfo = {
  id: string;
  fullName: string;
  status: Card["status"];
  printCount: number;
  /** 0-based: how many badges are ahead of this one, only set while it's actually queued. */
  queuePosition: number | null;
  queueTotal: number;
  /** A stable key for "these cards are on/will be on the same sheet" — a real page id
   *  once one exists, or a virtual one for a future sheet still forming in the queue. */
  groupKey: string;
  /** Everyone sharing that sheet, in print order — not just this card alone, since
   *  nothing prints by itself. Full 4 once the sheet is real or complete; fewer while a
   *  future sheet is still waiting on more badges to fill it out. */
  sheetNames: string[];
};

/**
 * Live status for a specific set of badges — an uploader has no login and no "my jobs"
 * concept, just a device that remembers what it recently sent in, so this is the one
 * place that turns a handful of card ids into "still queued (as part of which sheet,
 * with who else), built, printed, or given out" without making them dig through Records.
 */
export async function getCardStatuses(cardIds: string[]): Promise<CardStatusInfo[]> {
  if (cardIds.length === 0) return [];
  const rows = await db.query.cards.findMany({
    where: inArray(cards.id, cardIds),
    columns: { id: true, fullName: true, status: true, printCount: true },
  });
  const queued = rows.filter((r) => r.status === "UPLOADED" || r.status === "WAITING_TRAY");
  const onPage = rows.filter((r) => r.status === "ON_PAGE" || r.status === "PRINT_SENT");
  const queueTotal = await getQueueCount();

  const positions = new Map<string, number>();
  const queueChunks = new Map<number, string[]>(); // chunk index -> names in that future sheet
  if (queued.length) {
    const ranked = await db.execute<{ id: string; pos: number }>(sql`
      select id, pos from (
        select id, row_number() over (order by queue_rank asc nulls last, created_at asc, id asc) - 1 as pos
        from ${cards}
        where status in ('UPLOADED', 'WAITING_TRAY')
      ) ranked
      where id in (${sql.join(queued.map((r) => sql`${r.id}`), sql`, `)})
    `);
    for (const r of ranked.rows) positions.set(r.id, Number(r.pos));
    const chunkIndexes = [...new Set([...positions.values()].map((p) => Math.floor(p / CARDS_PER_PAGE)))];
    if (chunkIndexes.length) {
      const order = await db
        .select({ fullName: cards.fullName })
        .from(cards)
        .where(inArray(cards.status, ["UPLOADED", "WAITING_TRAY"]))
        .orderBy(...ORDER)
        .limit(Math.max(...chunkIndexes) * CARDS_PER_PAGE + CARDS_PER_PAGE);
      for (const ci of chunkIndexes) queueChunks.set(ci, order.slice(ci * CARDS_PER_PAGE, ci * CARDS_PER_PAGE + CARDS_PER_PAGE).map((o) => o.fullName));
    }
  }

  const pageInfo = new Map<string, { pageId: string; names: string[] }>();
  if (onPage.length) {
    const theirItems = await db
      .select({ cardId: pageItems.cardId, pageId: pageItems.pageId })
      .from(pageItems)
      .innerJoin(pages, eq(pages.id, pageItems.pageId))
      .where(and(inArray(pageItems.cardId, onPage.map((r) => r.id)), inArray(pages.status, ["READY", "SENT", "SPOOLED"])));
    const pageIds = [...new Set(theirItems.map((i) => i.pageId))];
    if (pageIds.length) {
      const allItems = await db
        .select({ pageId: pageItems.pageId, slot: pageItems.slot, fullName: cards.fullName })
        .from(pageItems)
        .innerJoin(cards, eq(cards.id, pageItems.cardId))
        .where(inArray(pageItems.pageId, pageIds))
        .orderBy(asc(pageItems.slot));
      const namesByPage = new Map<string, string[]>();
      for (const i of allItems) namesByPage.set(i.pageId, [...(namesByPage.get(i.pageId) ?? []), i.fullName]);
      for (const i of theirItems) pageInfo.set(i.cardId, { pageId: i.pageId, names: namesByPage.get(i.pageId) ?? [] });
    }
  }

  return rows.map((r) => {
    const pos = positions.get(r.id);
    const onP = pageInfo.get(r.id);
    const groupKey = onP ? `page:${onP.pageId}` : pos !== undefined ? `queue:${Math.floor(pos / CARDS_PER_PAGE)}` : `card:${r.id}`;
    const sheetNames = onP ? onP.names : pos !== undefined ? (queueChunks.get(Math.floor(pos / CARDS_PER_PAGE)) ?? [r.fullName]) : [r.fullName];
    return {
      id: r.id,
      fullName: r.fullName,
      status: r.status,
      printCount: r.printCount,
      queuePosition: pos ?? null,
      queueTotal,
      groupKey,
      sheetNames,
    };
  });
}

/**
 * Manually prioritize badges: the given ids (in the order they should queue) jump ahead
 * of everything else. Fractional indexing via a decreasing timestamp base keeps this to
 * one update per call regardless of how large the queue is, and a later reorder always
 * outranks an earlier one.
 */
export async function reorderQueue(orderedIds: string[], operator: string) {
  if (orderedIds.length === 0) return;
  const base = -(Date.now() * 1000);
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(cards).set({ queueRank: base + i, updatedAt: new Date() }).where(sql`${cards.id} = ${orderedIds[i]}`);
    }
  });
  void operator; // reorders aren't individually audited; the resulting page build is
}

/**
 * Builds a page from the queue and hands off to the normal layout/print/confirm pipeline.
 * `cardIds` explicit = a manual "print these specific ones" pick; omitted = pull the next
 * CARDS_PER_PAGE in queue order (optionally scoped to the current filter, e.g. one district).
 */
export async function buildFromQueue(opts: { cardIds?: string[]; filter?: QueueQuery; allowUnderfilled?: boolean }, operator: string) {
  let ids = opts.cardIds;
  if (!ids) {
    const where = opts.filter ? buildWhere(opts.filter) : inArray(cards.status, ["UPLOADED", "WAITING_TRAY"]);
    const rows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(where)
      .orderBy(...ORDER)
      .limit(CARDS_PER_PAGE);
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) throw new UserError("Nothing in the queue to build a page from");

  const [job] = await db.insert(jobs).values({ kind: "QUEUE", operator }).returning();
  return layoutJob(job.id, { addCardIds: ids, order: ids, allowUnderfilled: opts.allowUnderfilled }, operator);
}

/**
 * Builds every complete sheet the queue currently supports (pulled FIFO across the whole
 * queue, not just one upload) into one job and opens it for printing automatically.
 * Anything left over that doesn't complete a sheet (0-3 badges) stays in the queue
 * untouched — no "fix the count" interruption for a clean upload, and no forced trip to
 * the queue screen either. Returns null if there's nothing to build yet.
 */
export async function buildAllFromQueue(operator: string) {
  const total = await getQueueCount();
  const fullSheets = Math.floor(total / CARDS_PER_PAGE);
  if (fullSheets === 0) return { built: false as const, queueTotal: total, remainder: total };

  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(inArray(cards.status, ["UPLOADED", "WAITING_TRAY"]))
    .orderBy(...ORDER)
    .limit(fullSheets * CARDS_PER_PAGE);
  const ids = rows.map((r) => r.id);

  // Reuse the one job that's still waiting on the printer rather than always starting a
  // new one — otherwise every batch of 4 spawns its own job and "Built, not printed"
  // sprawls into a pile of small jobs instead of reading as one real queue. "Open" means
  // it still has a page nobody's sent yet; once every page in a job has gone to print,
  // the next batch starts a fresh one. layoutJob already appends addCardIds after a job's
  // existing READY pages in their current order, so leaving `order` unset here is what
  // keeps already-built sheets ahead of the new ones — passing it would re-sort the
  // whole thing and push the already-waiting sheets behind the new arrivals.
  const openJob = await db.execute<{ id: string }>(sql`
    select j.id from ${jobs} j
    where j.kind = 'QUEUE' and exists (select 1 from ${pages} p where p.job_id = j.id and p.status = 'READY')
    order by j.created_at asc
    limit 1
  `);
  const jobId = openJob.rows[0]?.id ?? (await db.insert(jobs).values({ kind: "QUEUE", operator }).returning())[0].id;

  const result = await layoutJob(jobId, { addCardIds: ids }, operator);
  return { built: true as const, queueTotal: total, remainder: total - ids.length, ...result };
}
