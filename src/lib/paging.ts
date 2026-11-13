/** One A4 sheet holds 4 A6 badges (2 x 2). */
export const CARDS_PER_PAGE = 4;

export function chunkIntoPages<T>(items: readonly T[], perPage = CARDS_PER_PAGE): T[][] {
  if (perPage < 1) throw new Error("perPage must be at least 1");
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

export type CountCheck = {
  total: number;
  fullPages: number;
  remainder: number; // cards left over after the full pages
  missing: number; // cards needed to complete the last page
  ok: boolean;
};

export function checkCount(total: number, perPage = CARDS_PER_PAGE): CountCheck {
  const remainder = total % perPage;
  return {
    total,
    fullPages: Math.floor(total / perPage),
    remainder,
    missing: remainder === 0 ? 0 : perPage - remainder,
    ok: total > 0 && remainder === 0,
  };
}

export function describeCount(c: CountCheck): string {
  const badges = `${c.total} ${c.total === 1 ? "badge" : "badges"}`;
  const sheets = `${c.fullPages} full ${c.fullPages === 1 ? "sheet" : "sheets"}`;
  if (c.remainder === 0) return `${badges}, ${sheets}`;
  if (c.fullPages === 0) return `${badges}, not enough for a full sheet`;
  return `${badges}: ${sheets} and ${c.remainder} extra`;
}

/**
 * A badge's place in the queue in terms of what actually happens to it — a sheet of 4
 * building and going to print — not its raw position, which reads like a single-file
 * line one badge doesn't actually move through alone.
 */
export function describeSheetPosition(position: number, queueTotal: number, perPage = CARDS_PER_PAGE): string {
  const sheetsAhead = Math.floor(position / perPage);
  const ownSheetComplete = queueTotal - sheetsAhead * perPage >= perPage;
  if (sheetsAhead === 0) {
    return ownSheetComplete ? "Part of the next sheet — ready to build" : `Waiting on ${perPage - queueTotal} more for a full sheet`;
  }
  return `${sheetsAhead} ${sheetsAhead === 1 ? "sheet" : "sheets"} ahead of it`;
}
