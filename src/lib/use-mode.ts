"use client";

import { createStoredStore } from "./stored-store";

export type DeskMode = "printer" | "uploader";

/**
 * Which interface this device shows — a per-device choice (localStorage), not tied to
 * whoever's picked as the operator. A real desk has one machine wired to the printer and
 * any number of other machines just taking in files, so this has to live with the
 * browser/device, not the person.
 */
const modeStore = createStoredStore<DeskMode>("desk.mode", "local", "printer");

export function useMode() {
  return modeStore.useValue();
}
