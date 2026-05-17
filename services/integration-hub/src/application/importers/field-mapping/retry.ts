/**
 * Retry with exponential backoff — connector framework plumbing.
 *
 * Pillar 17 issue 15 / Pillar 13 issue 09: rate-limit (429) → exponential backoff;
 * network timeout → retry 3×; final failure → throw with partial count.
 */

import type { RetryConfig } from "./types.ts";
import { DEFAULT_RETRY_CONFIG } from "./types.ts";

export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = "RetryExhaustedError";
  }
}

/**
 * Execute `fn` with exponential backoff on retryable errors.
 * A response is retryable if `shouldRetry` returns true (default: 429 or network error).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  shouldRetry: (error: unknown) => boolean = defaultShouldRetry,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= config.maxRetries || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(
        config.baseDelayMs * 2 ** attempt,
        config.maxDelayMs,
      );
      await sleep(delay);
    }
  }
  // Unreachable, but TypeScript needs it
  throw new RetryExhaustedError(
    `Retry exhausted after ${config.maxRetries + 1} attempts`,
    config.maxRetries + 1,
    lastError,
  );
}

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 429 || error.status >= 500;
  }
  // Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
  if (error instanceof Error && "code" in error) {
    const code = (error as { code: string }).code;
    return ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT"].includes(code);
  }
  return false;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
