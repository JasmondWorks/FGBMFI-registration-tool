"use client";

import { createStoredStore } from "@/lib/stored-store";

/**
 * The reprint list being built. Kept in sessionStorage so selections made on the records
 * page, in the viewer, or from a failed print carry over to the reprint screen.
 */
export type ReprintDraft = { cardIds: string[]; reason?: string };

const EMPTY: ReprintDraft = { cardIds: [] };
export const reprintDraftStore = createStoredStore<ReprintDraft>("desk.reprintDraft", "session", EMPTY);

export const getReprintDraft = reprintDraftStore.get;
export const setReprintDraft = (draft: ReprintDraft) => reprintDraftStore.set(draft);
export const useReprintDraft = reprintDraftStore.useValue;

export function addToReprintDraft(cardIds: string[]) {
  reprintDraftStore.set((d) => ({ ...d, cardIds: [...new Set([...d.cardIds, ...cardIds])] }));
}

export function clearReprintDraft() {
  reprintDraftStore.set(EMPTY);
}
