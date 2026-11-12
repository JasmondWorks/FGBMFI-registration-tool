import "server-only";

import type { CardSummary } from "@/lib/types";
import type { Card } from "./db/schema";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toCardSummary(c: Card): CardSummary {
  return {
    id: c.id,
    fullName: c.fullName,
    titles: c.titles,
    district: c.district,
    chapter: c.chapter,
    registrationId: c.registrationId,
    status: c.status,
    printCount: c.printCount,
    lastPrintedAt: iso(c.lastPrintedAt),
    lastPrintedBy: c.lastPrintedBy,
    badgeGeneratedAt: iso(c.badgeGeneratedAt),
    originalFilename: c.originalFilename,
    needsReview: c.needsReview,
    reviewReasons: c.reviewReasons,
    uploadedBy: c.uploadedBy,
    createdAt: c.createdAt.toISOString(),
    mimeType: c.mimeType,
    extraFields: c.extraFields,
    cloudStatus: c.cloudStatus,
  };
}
