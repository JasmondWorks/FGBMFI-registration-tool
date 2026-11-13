import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Settings are unlocked by a signed, HttpOnly session cookie instead of the client holding
 * the PIN itself — the PIN is checked once (verifyPin), and from then on every protected
 * route (reset, printer settings) re-checks this cookie server-side, with a constant-time
 * comparison so the signature can't be timed. No server-side session store needed: the
 * cookie's own signature is the proof, and it has no Max-Age so it dies with the browser
 * session and also carries a hard expiry in case that session runs long.
 *
 * The HMAC key is deliberately NOT the PIN itself — a 4-digit PIN is only 10,000
 * possibilities, so anyone who captured a cookie could brute-force it offline in an
 * instant and forge their own tokens. SETTINGS_COOKIE_SECRET (set it to any long random
 * string) is the real signing key; DATABASE_URL — which already has to be a real secret,
 * with a generated password in it — is a reasonable fallback so this doesn't become a
 * second required secret under event-day time pressure.
 */
const COOKIE_NAME = "desk_settings_unlock";
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours, generous for one shift

function pin() {
  const value = process.env.RESET_PIN;
  if (!value) throw new Error("RESET_PIN isn't set on the server, so settings are locked. Set it in the environment first.");
  return value;
}

function signingKey() {
  const dedicated = process.env.SETTINGS_COOKIE_SECRET;
  if (dedicated) return dedicated;
  const fallbackSource = process.env.DATABASE_URL;
  if (!fallbackSource) throw new Error("Neither SETTINGS_COOKIE_SECRET nor DATABASE_URL is set — can't sign the settings-unlock cookie.");
  return createHash("sha256").update(fallbackSource).digest("hex");
}

// Folds the current PIN into the signed payload (as a hash, never the PIN itself) so that
// rotating RESET_PIN automatically invalidates every cookie signed under the old one.
function pinFingerprint() {
  return createHash("sha256").update(pin()).digest("hex").slice(0, 16);
}

function sign(expiresAt: number): string {
  const mac = createHmac("sha256", signingKey()).update(`${expiresAt}.${pinFingerprint()}`).digest("hex");
  return `${expiresAt}.${mac}`;
}

function verify(token: string): boolean {
  const [expiresAtRaw, mac] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !mac || !Number.isFinite(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;
  const expected = createHmac("sha256", signingKey()).update(`${expiresAt}.${pinFingerprint()}`).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPin(entered: string): boolean {
  const a = Buffer.from(entered);
  const b = Buffer.from(pin());
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
