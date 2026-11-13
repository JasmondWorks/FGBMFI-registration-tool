import "server-only";

import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";

import { nameKeysLookSimilar } from "@/lib/badge/normalize";
import type { AnalyzedFile, DuplicateMatch } from "@/lib/types";
import { logEvents, type AuditInput } from "./audit";
import { isCloudEnabled, retryCloudSync as retryCloudSyncImpl, uploadCardFile } from "./cloudinary";
import { db } from "./db";
import { cards, jobs, type Card } from "./db/schema";
import { extractBadge, type Extraction } from "./extract";
import { UserError } from "./http";
import { toCardSummary } from "./mappers";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  discardStaging,
  readStagingFile,
  readStagingMeta,
  saveStaging,
} from "./storage";

const UPLOAD_CONCURRENCY = 4;

type StagingMeta = { originalFilename: string; sizeBytes: number; extraction: Omit<Extraction, "badgeGeneratedAt"> & { badgeGeneratedAt: string | null } };

/* ------------------------------------------------------------------ */
/* Analyse: store in staging, read the badge, look for duplicates      */
/* ------------------------------------------------------------------ */

export async function analyzeUpload(file: File): Promise<AnalyzedFile> {
  const mime = normalizeMime(file);
  if (!ALLOWED_MIME_TYPES.includes(mime)) throw new UserError(`${file.name}: only PDF, PNG or JPG files are accepted`);
  if (file.size > MAX_FILE_BYTES) throw new UserError(`${file.name}: file is larger than 10 MB`);
  if (file.size === 0) throw new UserError(`${file.name}: file is empty`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extraction = await extractBadge(bytes, mime, file.name);
  const stagingId = await saveStaging<StagingMeta>(bytes, mime, {
    originalFilename: file.name,
    sizeBytes: file.size,
    extraction: { ...extraction, badgeGeneratedAt: extraction.badgeGeneratedAt?.toISOString() ?? null },
  });
  const duplicates = await findDuplicates(extraction);

  return {
    stagingId,
    originalFilename: file.name,
    mimeType: mime,
    sizeBytes: file.size,
    fileHash: extraction.fileHash,
    fullName: extraction.fullName,
    titles: extraction.titles,
    district: extraction.district,
    chapter: extraction.chapter,
    registrationId: extraction.registrationId,
    badgeGeneratedAt: extraction.badgeGeneratedAt?.toISOString() ?? null,
    extractionSource: extraction.extractionSource,
    needsReview: extraction.needsReview,
    reviewReasons: extraction.reviewReasons,
    duplicates,
  };
}

function normalizeMime(file: File) {
  if (file.type === "image/jpg") return "image/jpeg";
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * Strongest signal first: identical file, then the registration ID printed on the badge,
 * then name (+ chapter) from the badge text.
 */
export async function findDuplicates(x: Pick<Extraction, "fileHash" | "registrationId" | "nameKey" | "chapter" | "badgeGeneratedAt">): Promise<DuplicateMatch[]> {
  const conditions = [eq(cards.fileHash, x.fileHash), eq(cards.nameKey, x.nameKey)];
  if (x.registrationId) conditions.push(eq(cards.registrationId, x.registrationId));
  const rows = await db.query.cards.findMany({
    where: and(or(...conditions), ne(cards.status, "DISCARDED")),
    limit: 20,
  });

  const matches: DuplicateMatch[] = [];
  for (const row of rows) {
    const existing = toCardSummary(row);
    if (row.fileHash === x.fileHash) {
      matches.push({ type: "EXACT_FILE", strength: 3, label: "Exact same file", existing });
      continue;
    }
    if (row.status === "SUPERSEDED") continue; // replaced versions only matter for exact copies
    const version = compareVersions(x.badgeGeneratedAt, row.badgeGeneratedAt);
    if (x.registrationId && row.registrationId === x.registrationId) {
      if (version === "newer") matches.push({ type: "NEWER_VERSION", strength: 3, label: "Newer version of a badge already in the system", existing });
      else if (version === "older") matches.push({ type: "OLDER_VERSION", strength: 3, label: "Older version of a badge already in the system", existing });
      else matches.push({ type: "SAME_REG_ID", strength: 3, label: "Same registration ID", existing });
      continue;
    }
    const sameChapter = !!x.chapter && !!row.chapter && x.chapter.toLowerCase() === row.chapter.toLowerCase();
    matches.push({
      type: "SAME_NAME",
      strength: sameChapter ? 2 : 1,
      label: sameChapter ? "Same name and chapter" : "Same name, different or unknown chapter",
      existing,
    });
  }

  // A typo'd registration has to be fixed by registering again on the platform, which
  // gives it a brand new registration ID and (intentionally) a different name — so it
  // matches none of the exact checks above. Bounded to the same chapter: cheap, and the
  // realistic case (same attendee, same event) almost always still has one.
  if (x.chapter && matches.length === 0) {
    const candidates = await db.query.cards.findMany({
      where: and(eq(cards.chapter, x.chapter), ne(cards.status, "DISCARDED"), ne(cards.status, "SUPERSEDED"), ne(cards.nameKey, x.nameKey)),
      limit: 200,
    });
    for (const row of candidates) {
      if (nameKeysLookSimilar(x.nameKey, row.nameKey)) {
        matches.push({ type: "SIMILAR_NAME", strength: 1, label: "Name looks similar — possible typo'd re-registration", existing: toCardSummary(row) });
      }
    }
  }

  return matches.sort((a, b) => b.strength - a.strength);
}

function compareVersions(incoming: Date | null, existing: Date | null) {
  if (!incoming || !existing) return "unknown" as const;
  if (incoming.getTime() > existing.getTime()) return "newer" as const;
  if (incoming.getTime() < existing.getTime()) return "older" as const;
  return "same" as const;
}

/* ------------------------------------------------------------------ */
/* Commit: accept staged files as cards in a job                       */
/* ------------------------------------------------------------------ */

export type CommitItem = { stagingId: string; supersedeCardIds?: string[] };

export async function commitIntake(input: {
  items: CommitItem[];
  excludedStagingIds: string[];
  excludedReasons?: Record<string, string>;
  jobId?: string | null;
  operator: string;
}) {
  const { items, operator } = input;
  // Excluded files never become cards; we only keep an audit trail of the decision.
  const exclusionEvents: AuditInput[] = [];
  for (const id of input.excludedStagingIds) {
    const meta = await readStagingMeta<StagingMeta>(id);
    if (meta) {
      exclusionEvents.push({
        type: "DUPLICATE_EXCLUDED",
        actor: operator,
        payload: { filename: meta.originalFilename, fullName: meta.extraction.fullName, reason: input.excludedReasons?.[id] ?? "Excluded by operator" },
      });
    }
    await discardStaging(id);
  }

  if (items.length === 0) {
    await logEvents(exclusionEvents);
    return { jobId: input.jobId ?? null, cardIds: [] as string[] };
  }

  if (!isCloudEnabled()) throw new UserError("Cloud storage isn't configured (CLOUDINARY_URL is missing) — badges can't be saved.");

  type Prepared = { item: CommitItem; meta: StagingMeta & { ext: string; mime: string }; cardId: string; cloud: { publicId: string; url: string } };
  const prepared: Prepared[] = new Array(items.length);
  // Uploading to Cloudinary is the thing that makes a badge durable, so it happens before
  // any database write, with limited concurrency so a batch of a few hundred files doesn't
  // open a few hundred uploads at once. If any file fails, nothing is committed — the
  // staged files are untouched, so the operator just tries "Continue" again.
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      const meta = await readStagingMeta<StagingMeta>(item.stagingId);
      if (!meta) throw new UserError("Some files expired before they were accepted. Please upload them again.");
      const staged = await readStagingFile(item.stagingId);
      if (!staged) throw new UserError("Some files expired before they were accepted. Please upload them again.");
      const cardId = crypto.randomUUID();
      const cloud = await uploadCardFile(cardId, staged.bytes, new Date(), {
        fullName: meta.extraction.fullName,
        registrationId: meta.extraction.registrationId,
      }).catch((err) => {
        throw new UserError(`Couldn't save ${meta.originalFilename} to cloud storage: ${err instanceof Error ? err.message : "unknown error"}. Nothing was committed — try again.`);
      });
      prepared[i] = { item, meta, cardId, cloud };
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, worker));

  const metas = prepared;
  const result = await db.transaction(async (tx) => {
    let jobId = input.jobId ?? null;
    const events: AuditInput[] = [...exclusionEvents];

    if (jobId) {
      const job = await tx.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
      if (!job || job.kind !== "UPLOAD") throw new UserError("That upload no longer exists");
    } else {
      const [job] = await tx.insert(jobs).values({ kind: "UPLOAD", operator }).returning();
      jobId = job.id;
      // Badges held in the waiting tray join this upload first, so they print next.
      const tray = await tx
        .update(cards)
        .set({ jobId, status: "UPLOADED", updatedAt: new Date() })
        .where(eq(cards.status, "WAITING_TRAY"))
        .returning({ id: cards.id });
      if (tray.length > 0) {
        events.push({ type: "MOVED_TO_TRAY", actor: operator, jobId, payload: { action: "joined-upload", cardIds: tray.map((t) => t.id) } });
      }
    }

    const base = Date.now();
    const created: Card[] = [];
    for (let i = 0; i < metas.length; i++) {
      const { item, meta, cardId: id, cloud } = metas[i];
      const x = meta.extraction;
      const [card] = await tx
        .insert(cards)
        .values({
          id,
          jobId,
          originalFilename: meta.originalFilename,
          fileHash: x.fileHash,
          mimeType: meta.mime,
          sizeBytes: meta.sizeBytes,
          pageWidthPt: x.pageWidthPt,
          pageHeightPt: x.pageHeightPt,
          cloudStatus: "SYNCED",
          cloudinaryPublicId: cloud.publicId,
          cloudinaryUrl: cloud.url,
          titles: x.titles,
          postNominals: x.postNominals,
          fullName: x.fullName,
          nameKey: x.nameKey,
          district: x.district,
          chapter: x.chapter,
          registrationId: x.registrationId,
          extraFields: x.extraFields,
          badgeSize: x.badgeSize,
          badgeGeneratedAt: x.badgeGeneratedAt ? new Date(x.badgeGeneratedAt) : null,
          filenameName: x.filenameName,
          rawText: x.rawText,
          searchText: x.searchText,
          extractionSource: x.extractionSource,
          needsReview: x.needsReview,
          reviewReasons: x.reviewReasons,
          badgeFormat: x.badgeFormat,
          status: "UPLOADED",
          uploadedBy: operator,
          // keep upload order stable for paging
          createdAt: new Date(base + i),
          updatedAt: new Date(base + i),
        })
        .returning();
      created.push(card);
      events.push({
        type: "UPLOADED",
        actor: operator,
        cardId: card.id,
        jobId,
        payload: { filename: card.originalFilename, fullName: card.fullName, registrationId: card.registrationId },
      });

      const supersede = (item.supersedeCardIds ?? []).filter(Boolean);
      if (supersede.length > 0) {
        const old = await tx.query.cards.findMany({ where: inArray(cards.id, supersede) });
        const onOpenPage = old.find((o) => o.status === "ON_PAGE" || o.status === "PRINT_SENT");
        if (onOpenPage) {
          throw new UserError(
            `${onOpenPage.fullName} is on a page that hasn't been confirmed yet. Finish or remove that page before replacing the badge.`,
          );
        }
        await tx
          .update(cards)
          .set({ status: "SUPERSEDED", supersededById: card.id, updatedAt: new Date() })
          .where(and(inArray(cards.id, supersede), notInArray(cards.status, ["DISCARDED"])));
        for (const o of old) {
          events.push({
            type: "SUPERSEDED",
            actor: operator,
            cardId: o.id,
            payload: { replacedBy: card.id, wasPrinted: o.printCount > 0, fullName: o.fullName },
          });
        }
      }
    }

    await logEvents(events, tx);
    return { jobId: jobId!, cardIds: created.map((c) => c.id) };
  });

  // Only clean up staging now that the cards are durably committed — a failed transaction
  // above (e.g. the "page hasn't been confirmed yet" guard) leaves staged files alone so
  // nothing already-uploaded-to-Cloudinary is orphaned without a card to show for it.
  await Promise.all(prepared.map((p) => discardStaging(p.item.stagingId)));
  return result;
}

export const retryCloudSync = retryCloudSyncImpl;
