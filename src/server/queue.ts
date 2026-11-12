import "server-only";

import { and, asc, inArray, sql, type SQL } from "drizzle-orm";

import { CARDS_PER_PAGE } from "@/lib/paging";
import { normalizeText } from "@/lib/badge/normalize";
import { db } from "./db";
import { cards, jobs } from "./db/schema";
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
  district: string[];
  p: number;
  size: number;
};

function buildWhere(q: QueueQuery, skip?: "district"): SQL | undefined {
  const parts: (SQL | undefined)[] = [inArray(cards.status, ["UPLOADED", "WAITING_TRAY"])];
  const words = normalizeText(q.q).split(" ").filter(Boolean).slice(0, 8);
  for (const w of words) parts.push(sql`${cards.searchText} like ${"%" + w + "%"}`);
  if (skip !== "district" && q.district.length) parts.push(inArray(cards.district, q.district));
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

/** District options with counts, so the filter only shows districts actually waiting in the queue. */
export async function getQueueDistricts(q: QueueQuery) {
  const rows = await db
    .select({ value: cards.district, count: sql<number>`count(*)` })
    .from(cards)
    .where(and(buildWhere(q, "district"), sql`${cards.district} is not null and ${cards.district} <> ''`))
    .groupBy(cards.district)
    .orderBy(sql`count(*) desc`, cards.district)
    .limit(300);
  return rows.map((r) => ({ value: r.value as string, count: Number(r.count) }));
}

export async function getQueueCount() {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(cards)
    .where(inArray(cards.status, ["UPLOADED", "WAITING_TRAY"]));
  return Number(total);
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
  if (fullSheets === 0) return null;

  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(inArray(cards.status, ["UPLOADED", "WAITING_TRAY"]))
    .orderBy(...ORDER)
    .limit(fullSheets * CARDS_PER_PAGE);
  const ids = rows.map((r) => r.id);

  const [job] = await db.insert(jobs).values({ kind: "QUEUE", operator }).returning();
  return layoutJob(job.id, { addCardIds: ids, order: ids }, operator);
}
