"use client";

import { createStoredStore } from "./stored-store";

const MAX_TRACKED = 40;

/**
 * This device's own recent uploads — there's no login, so "my uploads" can only ever mean
 * "what this browser sent in", not anything tied to an account. Newest first, capped so
 * the status-lookup list (and the UI) doesn't grow without bound over a long shift.
 */
const store = createStoredStore<string[]>("desk.myUploads", "local", []);

export const useMyUploads = store.useValue;

export function addMyUploads(cardIds: string[]) {
  if (cardIds.length === 0) return;
  store.set((prev) => [...cardIds, ...prev.filter((id) => !cardIds.includes(id))].slice(0, MAX_TRACKED));
}
