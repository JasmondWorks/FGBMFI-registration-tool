import "server-only";

import { and, asc, inArray, sql, type SQL } from "drizzle-orm";

import { CARDS_PER_PAGE } from "@/lib/paging";
import { normalizeText } from "@/lib/badge/normalize";
import { db } from "./db";
import { cards, jobs, type Card } from "./db/schema";
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
};

/**
 * Live status for a specific set of badges — an uploader has no login and no "my jobs"
 * concept, just a device that remembers what it recently sent in, so this is the one
 * place that turns a handful of card ids into "still queued (N ahead of it), built,
 * printed, or given out" without making them dig through Records to find out.
 */
export async function getCardStatuses(cardIds: string[]): Promise<CardStatusInfo[]> {
  if (cardIds.length === 0) return [];
  const rows = await db.query.cards.findMany({
    where: inArray(cards.id, cardIds),
    columns: { id: true, fullName: true, status: true, printCount: true },
  });
  const queued = rows.filter((r) => r.status === "UPLOADED" || r.status === "WAITING_TRAY");
  const queueTotal = await getQueueCount();
  let positions = new Map<string, number>();
  if (queued.length) {
    const ranked = await db.execute<{ id: string; pos: number }>(sql`
      select id, pos from (
        select id, row_number() over (order by queue_rank asc nulls last, created_at asc, id asc) - 1 as pos
        from ${cards}
        where status in ('UPLOADED', 'WAITING_TRAY')
      ) ranked
      where id in (${sql.join(queued.map((r) => sql`${r.id}`), sql`, `)})
    `);
    positions = new Map(ranked.rows.map((r) => [r.id, Number(r.pos)]));
  }
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    status: r.status,
    printCount: r.printCount,
    queuePosition: positions.get(r.id) ?? null,
    queueTotal,
  }));
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

  const [job] = await db.insert(jobs).values({ kind: "QUEUE", operator }).returning();
  const result = await layoutJob(job.id, { addCardIds: ids, order: ids }, operator);
  return { built: true as const, queueTotal: total, remainder: total - ids.length, ...result };
}
