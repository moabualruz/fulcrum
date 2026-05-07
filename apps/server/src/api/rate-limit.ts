import type { Context, Next } from "hono";

interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  now?: () => number;
  store?: Map<string, Bucket>;
  scope?: string;
}

interface Bucket {
  resetAt: number;
  count: number;
}

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;
const defaultStore = new Map<string, Bucket>();

export function rateLimit(options: RateLimitOptions = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const store = options.store ?? defaultStore;

  return async (c: Context, next: Next) => {
    const key = `${options.scope ?? `${limit}:${windowMs}`}:${await callerKey(c)}`;
    const current = now();
    const bucket = currentBucket(store, key, current, windowMs);
    const remaining = Math.max(0, limit - bucket.count - 1);

    setHeaders(c, limit, remaining, bucket.resetAt);

    if (bucket.count >= limit) {
      return c.json({
        error: {
          code: "RATE_LIMITED",
          message: "rate limit exceeded",
        },
      }, 429);
    }

    bucket.count += 1;
    setHeaders(c, limit, Math.max(0, limit - bucket.count), bucket.resetAt);
    await next();
  };
}

function currentBucket(
  store: Map<string, Bucket>,
  key: string,
  now: number,
  windowMs: number,
): Bucket {
  const existing = store.get(key);
  if (existing && existing.resetAt > now) return existing;
  const bucket = { resetAt: now + windowMs, count: 0 };
  store.set(key, bucket);
  return bucket;
}

async function callerKey(c: Context): Promise<string> {
  const userId = safeGet(c, "userId");
  if (userId) return `user:${userId}`;

  const orgId = safeGet(c, "orgId");
  if (orgId) return `org:${orgId}`;

  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return `api-key:${await sha256Hex(auth.slice(7))}`;
  }

  return `remote:${remoteAddress(c)}`;
}

function safeGet(c: Context, key: string): string | null {
  try {
    const value = c.get(key);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function remoteAddress(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip") || c.req.header("cf-connecting-ip") || "unknown";
}

function setHeaders(c: Context, limit: number, remaining: number, resetAt: number): void {
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
