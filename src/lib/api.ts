"use client";

import type { ApiResult } from "./types";

const OPERATOR_KEY = "desk.operator";

export function getOperator(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(OPERATOR_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setOperatorName(name: string) {
  try {
    localStorage.setItem(OPERATOR_KEY, name);
  } catch {
    // storage unavailable; the name still lives in React state for this session
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** fetch wrapper: sends the operator name, unwraps { ok, data }, and throws readable errors. */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const operator = getOperator();
  if (operator) headers.set("x-operator", encodeURIComponent(operator));
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, body });
  } catch {
    throw new ApiError("Can't reach the desk server. Is it still running?", 0);
  }
  let payload: ApiResult<T> | null = null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    throw new ApiError(`Unexpected response from the server (${res.status})`, res.status);
  }
  if (!payload.ok) throw new ApiError(payload.error, res.status);
  return payload.data;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Runs async tasks with a concurrency limit, reporting progress as each finishes. */
export async function runPool<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>, onDone?: (done: number) => void) {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await task(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
      done++;
      onDone?.(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
