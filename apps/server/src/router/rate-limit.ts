export interface RouterRateLimitRegistration {
  resource: string;
  limit: number;
  windowMs: number;
}

interface Bucket {
  resetAt: number;
  count: number;
}

export interface RouterRateLimitRouteOptions {
  limit?: number;
  windowMs?: number;
}

export interface RouterRateLimitOptions extends RouterRateLimitRouteOptions {
  now?: () => number;
  store?: Map<string, Bucket>;
  routes?: Record<string, RouterRateLimitRouteOptions>;
}

export interface RouterRateLimitCheckInput {
  path: string;
  type: "query" | "mutation" | "subscription" | string;
  ctx?: {
    orgId?: string | null;
    userId?: string | null;
    apiKeyHash?: string | null;
    session?: { user?: { id?: string | null } | null } | null;
  } | null;
}

export interface RouterRateLimitResult {
  allowed: true;
  limit: number;
  remaining: number;
  resetAt: number;
}

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;
const defaultStore = new Map<string, Bucket>();

export const routerRateLimiter: RouterRateLimitRegistration = {
  resource: "trpc",
  limit: DEFAULT_LIMIT,
  windowMs: DEFAULT_WINDOW_MS,
};

export const rateLimiterRegistration = routerRateLimiter;

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMITED";
  readonly status = 429;
  readonly limit: number;
  readonly resetAt: number;

  constructor(limit: number, resetAt: number) {
    super("rate limit exceeded");
    this.name = "RateLimitExceededError";
    this.limit = limit;
    this.resetAt = resetAt;
  }
}

export function createRouterRateLimiter(options: RouterRateLimitOptions = {}) {
  const defaultLimit = options.limit ?? DEFAULT_LIMIT;
  const defaultWindowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const store = options.store ?? defaultStore;

  return {
    async check(input: RouterRateLimitCheckInput): Promise<RouterRateLimitResult> {
      const routeOptions = options.routes?.[input.path] ?? {};
      const limit = routeOptions.limit ?? defaultLimit;
      const windowMs = routeOptions.windowMs ?? defaultWindowMs;
      const current = now();
      const key = [
        input.path,
        input.type,
        limit,
        windowMs,
        await routerCallerKey(input.ctx),
      ].join(":");
      const bucket = currentBucket(store, key, current, windowMs);

      if (bucket.count >= limit) {
        throw new RateLimitExceededError(limit, bucket.resetAt);
      }

      bucket.count += 1;
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      };
    },
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

async function routerCallerKey(ctx: RouterRateLimitCheckInput["ctx"]): Promise<string> {
  if (ctx?.orgId && ctx.userId) return `org:${ctx.orgId}:user:${ctx.userId}`;
  if (ctx?.userId) return `user:${ctx.userId}`;
  if (ctx?.session?.user?.id) return `user:${ctx.session.user.id}`;
  if (ctx?.orgId) return `org:${ctx.orgId}`;
  if (ctx?.apiKeyHash) return `api-key:${ctx.apiKeyHash}`;
  return "anonymous";
}
