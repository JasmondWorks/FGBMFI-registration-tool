import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Settings are unlocked by a signed, HttpOnly session cookie instead of the client holding
 * the PIN itself — the PIN is checked once (verifyPin), and from then on every protected
 * route (reset, printer settings) re-checks this cookie server-side, with a constant-time
 * comparison so the signature can't be timed. No server-side session store needed: the
 * cookie's own signature is the proof, and it has no Max-Age so it dies with the browser
 * session and also carries a hard expiry in case that session runs long.
 */
const COOKIE_NAME = "desk_settings_unlock";
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours, generous for one shift

function secret() {
  const pin = process.env.RESET_PIN;
  if (!pin) throw new Error("RESET_PIN isn't set on the server, so settings are locked. Set it in the environment first.");
  return pin;
}

function sign(expiresAt: number): string {
  const mac = createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
  return `${expiresAt}.${mac}`;
}

function verify(token: string): boolean {
  const [expiresAtRaw, mac] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !mac || !Number.isFinite(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;
  const expected = createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPin(pin: string): boolean {
  const a = Buffer.from(pin);
  const b = Buffer.from(secret());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueUnlockCookie() {
  const token = sign(Date.now() + TOKEN_TTL_MS);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // No maxAge/expires: a session cookie, cleared when the browser closes.
  });
}

export async function isUnlocked(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? verify(token) : false;
}
