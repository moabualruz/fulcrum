export interface RouterRateLimitRegistration {
  resource: string;
  limit: number;
  windowMs: number;
}

export const routerRateLimiter: RouterRateLimitRegistration = {
  resource: "trpc",
  limit: 120,
  windowMs: 60_000,
};

export const rateLimiterRegistration = routerRateLimiter;
