import { timingSafeEqual } from "@std/crypto/timing-safe-equal";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

export const SESSION_COOKIE = "doc_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7日間

const textEncoder = new TextEncoder();

const hmacSign = async (data: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(data),
  );
  return new Uint8Array(sig).toHex();
};

export const createSessionValue = async (
  userId: string,
  secret: string,
): Promise<string> => {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = await hmacSign(payload, secret);
  return `${payload}.${signature}`;
};

export const verifySessionValue = async (
  value: string,
  secret: string,
): Promise<boolean> => {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [userId, expiresAtStr, signature] = parts;
  if (!userId || !expiresAtStr || !signature) return false;

  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (Number.isNaN(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const payload = `${userId}.${expiresAtStr}`;
  const expected = await hmacSign(payload, secret);
  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    textEncoder.encode(expected),
    textEncoder.encode(signature),
  );
};

export const createDocAuthMiddleware = (sessionSecret: string) =>
  createMiddleware(async (c, next) => {
    const session = getCookie(c, SESSION_COOKIE);

    if (!session || !(await verifySessionValue(session, sessionSecret))) {
      const url = new URL(c.req.url);
      const redirect = `${url.pathname}${url.search}`;
      return c.redirect(
        `/api/doc/login?redirect=${encodeURIComponent(redirect)}`,
        302,
      );
    }

    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
