import "server-only";

import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, sql, type SQL } from "drizzle-orm";

import { canonicalLabel, canonicalName, canonicalTitle, nameKey, normalizeText } from "@/lib/badge/normalize";
import type { RecordsQuery } from "@/lib/records-query";
import type { CardDetail, Facets } from "@/lib/types";
import { logEvent } from "./audit";
import { db } from "./db";
import { enqueueDelete, triggerDeleteQueue } from "./cloudinary";
import { auditEvents, cards, jobs, pageItems, pages } from "./db/schema";
import { UserError } from "./http";
import { toCardSummary } from "./mappers";

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

function buildWhere(q: RecordsQuery, skip?: keyof RecordsQuery): SQL | undefined {
  const parts: (SQL | undefined)[] = [notInArray(cards.status, ["DISCARDED"])];

  // Every word must appear somewhere in the badge's searchable text (name, chapter, ID, filename...).
  const words = normalizeText(q.q).split(" ").filter(Boolean).slice(0, 8);
  for (const w of words) parts.push(sql`${cards.searchText} like ${"%" + w + "%"}`);

  if (skip !== "district" && q.district.length) parts.push(inArray(cards.district, q.district));
  if (skip !== "chapter" && q.chapter.length) parts.push(inArray(cards.chapter, q.chapter));
  if (skip !== "title" && q.title.length) {
    parts.push(sql`exists (select 1 from unnest(${cards.titles}) t where upper(trim(both '.' from t)) = any(${q.title.map((t) => t.toUpperCase())}))`);
  }
  if (skip !== "status" && q.status.length) {
    const statusParts: SQL[] = [];
    for (const s of q.status) {
      if (s === "REPRINTED") statusParts.push(sql`${cards.printCount} > 1`);
      else if (s === "NOT_PRINTED") statusParts.push(sql`${cards.printCount} = 0`);
      else statusParts.push(sql`${cards.status} = ${s}`);
    }
    parts.push(sql`(${sql.join(statusParts, sql` or `)})`);
  }
  if (skip !== "printedBy" && q.printedBy.length) parts.push(inArray(cards.lastPrintedBy, q.printedBy));
  if (q.review === "yes") parts.push(eq(cards.needsReview, true));
  if (q.review === "no") parts.push(eq(cards.needsReview, false));
  if (q.reprinted === "yes") parts.push(sql`${cards.printCount} > 1`);
  if (q.reprinted === "no") parts.push(sql`${cards.printCount} <= 1`);
  if (q.from) parts.push(gte(cards.lastPrintedAt, new Date(`${q.from}T00:00:00`)));
  if (q.to) {
    const end = new Date(`${q.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    parts.push(lt(cards.lastPrintedAt, end));
  }
  return and(...parts);
}

const SORTS: Record<string, SQL[]> = {
  name: [asc(cards.fullName)],
  lastPrinted: [sql`${cards.lastPrintedAt} asc nulls first`],
  printCount: [asc(cards.printCount)],
  chapter: [sql`${cards.chapter} asc nulls last`, asc(cards.fullName)],
  district: [sql`${cards.district} asc nulls last`, asc(cards.fullName)],
  created: [asc(cards.createdAt)],
};
const SORTS_DESC: Record<string, SQL[]> = {
  name: [desc(cards.fullName)],
  lastPrinted: [sql`${cards.lastPrintedAt} desc nulls last`],
  printCount: [desc(cards.printCount)],
  chapter: [sql`${cards.chapter} desc nulls last`, asc(cards.fullName)],
  district: [sql`${cards.district} desc nulls last`, asc(cards.fullName)],
  created: [desc(cards.createdAt)],
};

export async function listCards(q: RecordsQuery) {
  const where = buildWhere(q);
  const key = q.sort.replace(/^-/, "");
  const order = q.sort.startsWith("-") ? SORTS_DESC[key] : SORTS[key];
  const rows = await db
    .select()
    .from(cards)
    .where(where)
    .orderBy(...order, asc(cards.id))
    .limit(q.size)
    .offset((q.p - 1) * q.size);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(cards).where(where);
  return { rows: rows.map(toCardSummary), total: Number(total) };
}

/** All matching IDs (capped), so "select all matching" works across result pages. */
export async function listCardIds(q: RecordsQuery, cap = 2000) {
  const rows = await db.select({ id: cards.id }).from(cards).where(buildWhere(q)).orderBy(asc(cards.fullName)).limit(cap);
  return rows.map((r) => r.id);
}

export async function exportCards(q: RecordsQuery) {
  const rows = await db.select().from(cards).where(buildWhere(q)).orderBy(asc(cards.fullName)).limit(20000);
  return rows;
}

/** Filter options built from the data, each with a count. A filter only shows if the data exists. */
export async function getFacets(q: RecordsQuery): Promise<Facets> {
  const facet = async (col: SQL, skip: keyof RecordsQuery) => {
    const rows = await db
      .select({ value: sql<string>`${col}`, count: sql<number>`count(*)` })
      .from(cards)
      .where(and(buildWhere(q, skip), sql`${col} is not null and ${col} <> ''`))
      .groupBy(col)
      .orderBy(sql`count(*) desc`, col)
      .limit(300);
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  };

  const titleRows = await db.execute<{ value: string; count: string }>(sql`
    select upper(trim(both '.' from t)) as value, count(*) as count
    from ${cards}, unnest(${cards.titles}) as t
    where ${buildWhere(q, "title")}
    group by 1 order by 2 desc, 1 limit 100`);

  const statusCounts = await db
    .select({
      printed: sql<number>`count(*) filter (where ${cards.printCount} > 0)`,
      notPrinted: sql<number>`count(*) filter (where ${cards.printCount} = 0)`,
      reprinted: sql<number>`count(*) filter (where ${cards.printCount} > 1)`,
      sent: sql<number>`count(*) filter (where ${cards.status} = 'PRINT_SENT')`,
      tray: sql<number>`count(*) filter (where ${cards.status} = 'WAITING_TRAY')`,
      superseded: sql<number>`count(*) filter (where ${cards.status} = 'SUPERSEDED')`,
    })
    .from(cards)
    .where(buildWhere(q, "status"));
  const s = statusCounts[0];

  const extraRows = await db.execute<{ key: string; value: string; count: string }>(sql`
    select e.key, e.value, count(*) as count
    from ${cards}, jsonb_each_text(${cards.extraFields}) as e
    where ${buildWhere(q)}
    group by 1, 2 order by 3 desc limit 300`);
  const extra: Facets["extra"] = {};
  for (const r of extraRows.rows) (extra[r.key] ??= []).push({ value: r.value, count: Number(r.count) });

  return {
    district: await facet(sql`${cards.district}`, "district"),
    chapter: await facet(sql`${cards.chapter}`, "chapter"),
    title: titleRows.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
    printedBy: await facet(sql`${cards.lastPrintedBy}`, "printedBy"),
    status: [
      { value: "PRINTED", count: Number(s.printed) },
      { value: "NOT_PRINTED", count: Number(s.notPrinted) },
      { value: "REPRINTED", count: Number(s.reprinted) },
      { value: "PRINT_SENT", count: Number(s.sent) },
      { value: "WAITING_TRAY", count: Number(s.tray) },
      { value: "SUPERSEDED", count: Number(s.superseded) },
    ].filter((x) => x.count > 0),
    extra,
  };
}

/* ------------------------------------------------------------------ */
/* One badge                                                           */
/* ------------------------------------------------------------------ */

export async function getCardDetail(id: string): Promise<CardDetail> {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) throw new UserError("Badge not found", 404);

  const history = await db.query.auditEvents.findMany({
    where: eq(auditEvents.cardId, id),
    orderBy: [desc(auditEvents.createdAt), desc(auditEvents.id)],
    limit: 200,
  });
  const pageRows = await db
    .select({ page: pages, item: pageItems, kind: jobs.kind })
    .from(pageItems)
    .innerJoin(pages, eq(pages.id, pageItems.pageId))
    .innerJoin(jobs, eq(jobs.id, pages.jobId))
    .where(eq(pageItems.cardId, id))
    .orderBy(desc(pages.createdAt));
  const supersedes = await db.query.cards.findFirst({ where: eq(cards.supersededById, id), columns: { id: true, fullName: true } });

  return {
    ...toCardSummary(card),
    postNominals: card.postNominals,
    filenameName: card.filenameName,
    extractionSource: card.extractionSource,
    rawText: card.rawText,
    supersededById: card.supersededById,
    supersedes: supersedes ?? null,
    firstPrintedAt: card.firstPrintedAt?.toISOString() ?? null,
    cloudinaryUrl: card.cloudinaryUrl,
    history: history.map((h) => ({
      id: h.id,
      type: h.type,
      actor: h.actor,
      createdAt: h.createdAt.toISOString(),
      pageId: h.pageId,
      jobId: h.jobId,
      payload: h.payload,
    })),
    pages: pageRows.map((r) => ({
      pageId: r.page.id,
      jobKind: r.kind,
      pageNumber: r.page.pageNumber,
      status: r.page.status,
      slot: r.item.slot,
      printed: r.item.printed,
      sentAt: r.page.sentAt?.toISOString() ?? null,
    })),
  };
}

export async function getCardFileInfo(id: string) {
  return db.query.cards.findFirst({
    where: eq(cards.id, id),
    columns: { id: true, localPath: true, mimeType: true, originalFilename: true, cloudinaryUrl: true },
  });
}

export type CardEdit = {
  fullName?: string;
  titles?: string[];
  district?: string | null;
  chapter?: string | null;
  registrationId?: string | null;
  markReviewed?: boolean;
};

export async function updateCard(id: string, edit: CardEdit, operator: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) throw new UserError("Badge not found", 404);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const next = { ...card };
  const set = <K extends keyof typeof card>(key: K, value: (typeof card)[K]) => {
    if (JSON.stringify(card[key]) !== JSON.stringify(value)) {
      changes[key as string] = { from: card[key], to: value };
      next[key] = value;
    }
  };
  if (edit.fullName !== undefined) {
    const v = canonicalName(edit.fullName);
    if (!v) throw new UserError("Name can't be empty");
    set("fullName", v);
    set("nameKey", nameKey(v));
  }
  if (edit.titles !== undefined) set("titles", edit.titles.map(canonicalTitle).filter(Boolean));
  if (edit.district !== undefined) set("district", canonicalLabel(edit.district));
  if (edit.chapter !== undefined) set("chapter", canonicalLabel(edit.chapter));
  if (edit.registrationId !== undefined) set("registrationId", edit.registrationId?.trim() || null);
  if (edit.markReviewed) {
    set("needsReview", false);
    set("reviewReasons", []);
  }
  if (Object.keys(changes).length === 0) return toCardSummary(card);

  const searchText = normalizeText(
    [next.titles.join(" "), next.fullName, next.district, next.chapter, next.registrationId, next.originalFilename, next.rawText]
      .filter(Boolean)
      .join(" "),
  );
  const [updated] = await db
    .update(cards)
    .set({
      fullName: next.fullName,
      nameKey: next.nameKey,
      titles: next.titles,
      district: next.district,
      chapter: next.chapter,
      registrationId: next.registrationId,
      needsReview: next.needsReview,
      reviewReasons: next.reviewReasons,
      searchText,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, id))
    .returning();
  await logEvent({ type: "FIELD_EDITED", actor: operator, cardId: id, payload: { changes } });
  return toCardSummary(updated);
}

/**
 * Removes a badge created by mistake (wrong file, duplicate that slipped through, typo'd
 * upload). Soft delete, same as every other removal path in the app: the record and its
 * history stay for the audit trail, just excluded from search, the queue and dedup checks.
 */
export async function deleteCard(id: string, operator: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) throw new UserError("Badge not found", 404);
  if (card.status === "DISCARDED") return toCardSummary(card);
  if (card.status === "ON_PAGE" || card.status === "PRINT_SENT") {
    throw new UserError(`${card.fullName} is on a sheet that hasn't been printed or confirmed yet. Remove it from that sheet first.`);
  }
  const [updated] = await db
    .update(cards)
    .set({ status: "DISCARDED", updatedAt: new Date() })
    .where(eq(cards.id, id))
    .returning();
  await logEvent({ type: "DISCARDED", actor: operator, cardId: id, payload: { fullName: card.fullName, reason: "Deleted by operator" } });
  // Queued, not called inline: the card is already discarded either way, and a Cloudinary
  // delete shouldn't make this request wait on a third-party round trip. The worker picks
  // it up right after this responds (see triggerDeleteQueue), with the queue row itself as
  // the durable retry if that doesn't get to it.
  if (card.cloudinaryPublicId) {
    await enqueueDelete(card.cloudinaryPublicId);
    triggerDeleteQueue();
  }
  return toCardSummary(updated);
}

/**
 * The actual last step: the badge wasn't just printed, it physically left the desk with
 * its owner. Only ever from PRINTED — a badge that hasn't printed yet can't have been
 * handed to anyone. Reversible (handed to the wrong person, or clicked by mistake) by
 * undoGivenOut below, which is exactly the "last line of defense" this exists for.
 */
export async function markGivenOut(id: string, operator: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) throw new UserError("Badge not found", 404);
  if (card.status !== "PRINTED") {
    throw new UserError(`${card.fullName}'s badge isn't confirmed printed yet — nothing to hand out.`);
  }
  const [updated] = await db.update(cards).set({ status: "GIVEN_OUT", updatedAt: new Date() }).where(eq(cards.id, id)).returning();
  await logEvent({ type: "GIVEN_OUT", actor: operator, cardId: id, payload: { fullName: card.fullName } });
  return toCardSummary(updated);
}

export async function undoGivenOut(id: string, operator: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) throw new UserError("Badge not found", 404);
  if (card.status !== "GIVEN_OUT") throw new UserError(`${card.fullName}'s badge isn't marked given out.`);
  const [updated] = await db.update(cards).set({ status: "PRINTED", updatedAt: new Date() }).where(eq(cards.id, id)).returning();
  await logEvent({ type: "GIVEN_OUT_UNDONE", actor: operator, cardId: id, payload: { fullName: card.fullName } });
  return toCardSummary(updated);
}

/**
 * Manually sets the crop region for a FULL_CARD-format badge (one with the whole card's
 * artwork baked in, not just a name overlay) — there's no automatic way to know where the
 * dynamic part sits on an unfamiliar template, so the operator draws it once. Box is in
 * PDF points, bottom-left origin, matching what sheet-pdf.ts expects at print time.
 */
export async function setCardCropBox(id: string, cropBox: { x: number; y: number; width: number; height: number }, operator: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) throw new UserError("Badge not found", 404);
  const reviewReasons = card.reviewReasons.filter((r) => !r.startsWith("This file has a background image baked in"));
  const [updated] = await db
    .update(cards)
    .set({ cropBox, reviewReasons, needsReview: reviewReasons.length > 0, updatedAt: new Date() })
    .where(eq(cards.id, id))
    .returning();
  await logEvent({ type: "FIELD_EDITED", actor: operator, cardId: id, payload: { changes: { cropBox: { from: card.cropBox, to: cropBox } } } });
  return toCardSummary(updated);
}

/** Log that someone opened a badge, at most once per operator per 10 minutes. */
export async function logViewed(cardId: string, operator: string) {
  const recent = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.cardId, cardId),
        eq(auditEvents.type, "VIEWED"),
        eq(auditEvents.actor, operator),
        gte(auditEvents.createdAt, new Date(Date.now() - 10 * 60 * 1000)),
      ),
    )
    .limit(1);
  if (recent.length === 0) await logEvent({ type: "VIEWED", actor: operator, cardId });
}

export async function quickFind(q: string, limit = 12) {
  const words = normalizeText(q).split(" ").filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  const rows = await db
    .select()
    .from(cards)
    .where(and(ne(cards.status, "DISCARDED"), ...words.map((w) => sql`${cards.searchText} like ${"%" + w + "%"}`)))
    .orderBy(desc(cards.lastPrintedAt), asc(cards.fullName))
    .limit(limit);
  return rows.map(toCardSummary);
}
