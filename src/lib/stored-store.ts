"use client";

import * as React from "react";

/**
 * A small external store backed by localStorage or sessionStorage.
 * Components read it with useSyncExternalStore, so the server render and hydration use the
 * initial value and the stored value arrives right after, with no mismatch and no
 * setState-in-effect. Imperative helpers (add to reprint list from anywhere) share the same store.
 */
export function createStoredStore<T>(key: string, kind: "local" | "session", initial: T) {
  let cache: T | undefined;
  const listeners = new Set<() => void>();

  const storage = () => {
    try {
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };

  function get(): T {
    if (typeof window === "undefined") return initial;
    if (cache === undefined) {
      try {
        const raw = storage()?.getItem(key);
        cache = raw ? (JSON.parse(raw) as T) : initial;
      } catch {
        cache = initial;
      }
    }
    return cache;
  }

  function set(next: T | ((prev: T) => T)) {
    const value = typeof next === "function" ? (next as (prev: T) => T)(get()) : next;
    cache = value;
    try {
      storage()?.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked: the value still lives in memory for this session
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function useValue(): [T, typeof set] {
    const value = React.useSyncExternalStore(subscribe, get, () => initial);
    return [value, set];
  }

  return { get, set, subscribe, useValue };
}
