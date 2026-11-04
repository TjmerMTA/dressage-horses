// Hashing, constant-time comparison, rate limiting and sessions.

import { Env, HttpError } from "./http";

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time equality for two byte arrays (lengths are not secret here: both are 32). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export function clientIp(request: Request): string {
  // On Cloudflare this header is always set by the edge and cannot be forged by the client.
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

/**
 * Fixed-window counter in KV. Every call counts as one attempt.
 * KV is eventually consistent, so under a burst from many PoPs a few extra requests can
 * slip through; that is acceptable for this traffic. A failed KV write fails closed.
 */
export async function rateLimit(
  env: Env,
  scope: string,
  request: Request,
  limit: number,
  windowSec: number,
): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const window = Math.floor(nowSec / windowSec);
  const windowEnd = (window + 1) * windowSec;
  const retryAfter = String(Math.max(1, windowEnd - nowSec));
  // Raw IPs are not kept in KV; a truncated hash is enough to bucket them.
  const ipKey = toHex(await sha256(clientIp(request))).slice(0, 32);
  const key = `rl:${scope}:${ipKey}:${window}`;

  const current = parseInt((await env.KV.get(key)) || "0", 10) || 0;
  if (current >= limit) {
    throw new HttpError(429, "too many requests, try again later", { "Retry-After": retryAfter });
  }
  try {
    await env.KV.put(key, String(current + 1), { expiration: Math.max(windowEnd, nowSec) + 60 });
  } catch {
    throw new HttpError(429, "too many requests, try again later", { "Retry-After": retryAfter });
  }
}

export const SESSION_TTL_SEC = 12 * 60 * 60;
const TOKEN_RE = /^[0-9a-f]{64}$/;

/** KV key for a session. Only the token's hash is stored, so a KV listing reveals no live token. */
async function sessionKey(token: string): Promise<string> {
  return `session:${toHex(await sha256(token))}`;
}

export async function createSession(env: Env): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.KV.put(await sessionKey(token), JSON.stringify({ createdAt: new Date().toISOString() }), {
    expirationTtl: SESSION_TTL_SEC,
  });
  return token;
}

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer ([0-9a-f]{64})$/.exec(h.trim());
  return m && TOKEN_RE.test(m[1]!) ? m[1]! : null;
}

/** Returns the session's KV key, or throws 401. */
export async function requireSession(request: Request, env: Env): Promise<string> {
  const token = bearer(request);
  if (!token) throw new HttpError(401, "session required");
  const key = await sessionKey(token);
  const found = await env.KV.get(key);
  if (found === null) throw new HttpError(401, "session expired or invalid");
  return key;
}

export async function deleteSession(env: Env, key: string): Promise<void> {
  await env.KV.delete(key);
}

/** Checks a password against ADMIN_PASSWORD_HASH (hex SHA-256) in constant time. */
export async function checkPassword(env: Env, password: string): Promise<boolean> {
  const expected = fromHex((env.ADMIN_PASSWORD_HASH || "").trim().toLowerCase());
  if (!expected || expected.byteLength !== 32) throw new HttpError(500, "server not configured");
  const actual = await sha256(password);
  return timingSafeEqual(actual, expected);
}
