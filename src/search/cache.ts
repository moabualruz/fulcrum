import { createHash } from "node:crypto";

import type { SearchQueryInput, SearchQueryOutput } from "./query.ts";

export interface SearchCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}

interface CacheEntry {
  orgId: string;
  value: SearchQueryOutput;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_TTL_MS = 60_000;

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableValue(entryValue)]),
    );
  }
  return value;
}

function cachePayload(input: SearchQueryInput): { text: string; filters: Record<string, unknown> } {
  const { orgId: _orgId, q, now: _now, ...filters } = input;
  return {
    text: q?.trim() ?? "",
    filters: stableValue(filters) as Record<string, unknown>,
  };
}

function queryHash(input: SearchQueryInput): string {
  const payload = cachePayload(input);
  return createHash("sha256")
    .update(`${payload.text}${JSON.stringify(payload.filters)}`)
    .digest("hex");
}

export class SearchCache {
  readonly maxEntries: number;
  readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(options: SearchCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async query(
    input: SearchQueryInput,
    fetcher: () => Promise<SearchQueryOutput>,
  ): Promise<SearchQueryOutput> {
    const key = this.key(input);
    const cached = this.get(key);
    if (cached) return cached;

    const value = await fetcher();
    this.set(key, input.orgId, value);
    return value;
  }

  invalidateOrg(orgId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.orgId === orgId) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private key(input: SearchQueryInput): string {
    return `${input.orgId}:${queryHash(input)}`;
  }

  private get(key: string): SearchQueryOutput | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (this.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  private set(key: string, orgId: string, value: SearchQueryOutput): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, {
      orgId,
      value,
      expiresAt: this.now() + this.ttlMs,
    });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

export const searchCache = new SearchCache();
