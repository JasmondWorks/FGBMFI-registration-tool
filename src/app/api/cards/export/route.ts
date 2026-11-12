import { inArray } from "drizzle-orm";

import { parseRecordsQuery } from "@/lib/records-query";
import { exportCards } from "@/server/cards";
import { db } from "@/server/db";
import { cards } from "@/server/db/schema";
import { handle } from "@/server/http";

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV of the current filtered view, or of the selected ids. */
export const GET = handle(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const rows = ids.length
    ? await db.select().from(cards).where(inArray(cards.id, ids.slice(0, 5000)))
    : await exportCards(parseRecordsQuery(params));

  const header = [
    "Title", "Full name", "District", "Chapter", "Registration ID", "Status", "Times printed",
    "First printed", "Last printed", "Last printed by", "Badge generated", "Uploaded by", "Uploaded at",
    "Needs review", "Review notes", "Filename",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.titles.join(" "), r.fullName, r.district, r.chapter, r.registrationId, r.status, r.printCount,
        r.firstPrintedAt, r.lastPrintedAt, r.lastPrintedBy, r.badgeGeneratedAt, r.uploadedBy, r.createdAt,
        r.needsReview ? "yes" : "no", r.reviewReasons.join("; "), r.originalFilename,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="badge-records-${stamp}.csv"`,
    },
  });
});
