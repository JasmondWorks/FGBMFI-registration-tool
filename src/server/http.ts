import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** Error with a message that is safe and useful to show the operator. */
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Wraps a route handler so every failure becomes a readable JSON error. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UserError) return fail(err.message, err.status);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return fail(`Invalid request: ${first?.path.join(".") || "body"} ${first?.message ?? ""}`.trim(), 400);
      }
      console.error(err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return fail(`Something went wrong: ${message}`, 500);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new UserError("Request body must be JSON");
  }
  return schema.parse(body);
}

/** The operator name is chosen in the top bar and sent on every change. */
export function requireOperator(req: Request): string {
  const raw = req.headers.get("x-operator");
  const name = raw ? decodeURIComponent(raw).trim() : "";
  if (!name) throw new UserError("Choose who is operating the desk first (top right).", 401);
  return name.slice(0, 80);
}
