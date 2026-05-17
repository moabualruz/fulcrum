export interface ApiKeyPrincipal {
  orgId: string;
  userId: string;
}

export interface ApiKeyLookup {
  findApiKeyByHash(hash: string): Promise<{ org_id: string; user_id: string } | null>;
}

export interface AuthenticationAccepted {
  ok: true;
  principal: ApiKeyPrincipal;
}

export interface AuthenticationRejected {
  ok: false;
  status: 401;
  body: { error: string };
}

export type AuthenticationResult = AuthenticationAccepted | AuthenticationRejected;

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  now?: () => number;
  store?: Map<string, RateLimitBucket>;
  scope?: string;
}

export interface RateLimitBucket {
  resetAt: number;
  count: number;
}

export interface RateLimitInput {
  userId?: string | null;
  orgId?: string | null;
  authorization?: string | null;
  remoteAddress?: string | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  status: 200 | 429;
  headers: Record<string, string>;
  body?: {
    error: {
      code: "RATE_LIMITED";
      message: string;
    };
  };
}

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;

export async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticateApiKey(
  authorization: string | null | undefined,
  lookup: ApiKeyLookup | null | undefined,
): Promise<AuthenticationResult> {
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, status: 401, body: { error: "authentication required" } };
  }

  const token = authorization.slice(7);
  const apiKey = await lookup?.findApiKeyByHash(await hashApiKey(token));
  if (!apiKey) {
    return { ok: false, status: 401, body: { error: "invalid API key" } };
  }

  return {
    ok: true,
    principal: {
      orgId: apiKey.org_id,
      userId: apiKey.user_id,
    },
  };
}

export function createRateLimitPolicy(options: RateLimitOptions = {}): (input: RateLimitInput) => Promise<RateLimitDecision> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const store = options.store ?? new Map<string, RateLimitBucket>();

  return async (input) => {
    const key = `${options.scope ?? `${limit}:${windowMs}`}:${await callerKey(input)}`;
    const current = now();
    const bucket = currentBucket(store, key, current, windowMs);
    const startingRemaining = Math.max(0, limit - bucket.count - 1);
    const headers = rateLimitHeaders(limit, startingRemaining, bucket.resetAt);

    if (bucket.count >= limit) {
      return {
        allowed: false,
        status: 429,
        headers,
        body: {
          error: {
            code: "RATE_LIMITED",
            message: "rate limit exceeded",
          },
        },
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      status: 200,
      headers: rateLimitHeaders(limit, Math.max(0, limit - bucket.count), bucket.resetAt),
    };
  };
}

function currentBucket(
  store: Map<string, RateLimitBucket>,
  key: string,
  now: number,
  windowMs: number,
): RateLimitBucket {
  const existing = store.get(key);
  if (existing && existing.resetAt > now) return existing;
  const bucket = { resetAt: now + windowMs, count: 0 };
  store.set(key, bucket);
  return bucket;
}

async function callerKey(input: RateLimitInput): Promise<string> {
  if (input.userId) return `user:${input.userId}`;
  if (input.orgId) return `org:${input.orgId}`;
  if (input.authorization?.startsWith("Bearer ")) {
    return `api-key:${await hashApiKey(input.authorization.slice(7))}`;
  }
  return `remote:${input.remoteAddress || "unknown"}`;
}

function rateLimitHeaders(limit: number, remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}
