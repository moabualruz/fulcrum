/**
 * FlagRegistry — feature-flag resolution with TTL cache.
 *
 * Resolution order per issue #07:
 *   1. featureFlagRepo.findOne({ org, user, flag }) — DB row (most specific wins).
 *   2. FULCRUM_FEATURES env var (comma-separated flag names).
 *   3. false (default off).
 *
 * D5: flag names are lowercase-with-hyphens, validated as FeatureFlagName union.
 * C8: @injectable() for needle-di; constructor accepts FeatureFlagRepository.
 *
 * Cache: 60s TTL, keyed by `${orgId ?? "global"}:${userId ?? "global"}:${flag}`.
 *   - clearCache() / bustFlag() for explicit invalidation (used after flags.set).
 *   - FlagRegistry is a singleton in the root DI container; cache is process-wide.
 *
 * Cuts through: registry.ts → FeatureFlag entity → tRPC flags.* → web/CLI/TUI.
 */

import type { FeatureFlagRepository } from "../db/repositories/auth/FeatureFlagRepository.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Registered feature flags — all 22 (D5: lowercase-with-hyphens)
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURE_FLAGS = [
  "router-llm",
  "embeddings",
  "memory-llm-extract",
  "saas-auth",
  "real-time-collab-server",
  "external-llm-provider",
  "public-api",
  "outbound-webhooks",
  "notify-email",
  "notify-webhook",
  "notify-slack",
  "notify-discord",
  "casbin-policies",
  "pgvector",
  "connector-linear",
  "symphony-ssh-worker",
  "symphony-http-api",
  "i18n",
  "report-llm-narration",
  "search-click-telemetry",
  "token-tracking",
  "session-resume",
] as const;

/** Union type of all registered feature flag names. */
export type FeatureFlagName = (typeof FEATURE_FLAGS)[number];

/**
 * Human-readable descriptions for every flag.
 * Used by the web flags page, TUI flags screen, and CLI `fulcrum flags list`.
 */
export const FLAG_DESCRIPTIONS: Record<FeatureFlagName, string> = {
  "router-llm": "Enable the LLM-based task router for agent dispatch decisions.",
  "embeddings": "Enable vector embeddings generation for documents and memories.",
  "memory-llm-extract": "Extract structured memories from conversations using LLM.",
  "saas-auth": "Enable SaaS authentication providers (OAuth, magic-link, email OTP). Email auth (magic-link / OTP) requires notify-email to also be ON for end-to-end delivery.",
  "real-time-collab-server": "Enable real-time collaborative editing via WebSocket server.",
  "external-llm-provider": "Allow connecting to external LLM providers (OpenAI, Anthropic, etc.).",
  "public-api": "Expose the public REST API for third-party integrations.",
  "outbound-webhooks": "Enable outbound webhook delivery to external URLs.",
  "notify-email": "Enable email notifications via configured SMTP provider.",
  "notify-webhook": "Enable webhook-based notifications to subscriber endpoints.",
  "notify-slack": "Enable Slack notifications via Slack app integration.",
  "notify-discord": "Enable Discord notifications via Discord webhook integration.",
  "casbin-policies": "Enable ABAC policy enforcement via node-casbin (gated by CasbinRule table).",
  "pgvector": "Enable pgvector extension for native Postgres vector similarity search.",
  "connector-linear": "Enable Linear issue tracker sync via Linear API connector.",
  "symphony-ssh-worker": "Enable Symphony SSH worker for remote command execution.",
  "symphony-http-api": "Enable Symphony HTTP API for webhook-triggered agent runs.",
  "i18n": "Enable locale catalogs, locale picker, and RTL rendering.",
  "report-llm-narration": "Enable LLM-powered memory digest and doc narration via inference sidecar.",
  "search-click-telemetry": "Enable search click telemetry writes to search_clicks table.",
  "token-tracking": "Enable per-profile token count parsing from agent stdout; writes token_used to agent_runs.",
  "session-resume": "Enable session resumption on retry runs (claude-code profile only); passes prior transcript to sandcastle.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Cache entry type
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

/** TTL in milliseconds (60 seconds). */
const TTL_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// FlagRegistry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FlagRegistry — resolves feature flags with 60s TTL caching.
 *
 * Registered as a singleton in the root needle-di container so the cache is
 * shared across all request contexts in a single process.
 *
 * Note: No @injectable() decorator — FlagRegistry uses Stage-3 decorator-free
 * class syntax so it can be safely imported into the SvelteKit web bundle
 * (which uses Node.js for SSR rendering; Stage-3 decorators break Node's SSR).
 * Registration in needle-di is done via container.bind({ provide: FlagRegistry, useValue })
 * in db.module.ts, which is the production wiring path.
 */
export class FlagRegistry {
  /** In-process TTL cache. Key: `${orgKey}:${userKey}:${flag}`. */
  private readonly _cache = new Map<string, CacheEntry>();

  /**
   * Constructor — accepts FeatureFlagRepository via needle-di injection.
   *
   * The default-param inject() pattern allows needle-di to wire the dependency
   * automatically when using the DI container, while tests can pass a concrete
   * repository directly (no container needed in unit tests).
   */
  constructor(private readonly _flagRepo: FeatureFlagRepository) {}

  /**
   * isEnabled — resolve a feature flag for the given context.
   *
   * Resolution order:
   *   1. DB row (per-user if userId given → per-org if orgId given → global).
   *   2. FULCRUM_FEATURES env var (comma-separated flag names).
   *   3. false.
   *
   * @param flag - The flag name (must be a FeatureFlagName).
   * @param ctx  - Optional org/user scope for per-tenant overrides.
   */
  async isEnabled(
    flag: FeatureFlagName,
    ctx?: { orgId?: string; userId?: string },
  ): Promise<boolean> {
    const cacheKey = this._cacheKey(flag, ctx);
    const cached = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await this._resolve(flag, ctx);
    this._cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  }

  /**
   * clearCache — invalidate all cached entries.
   * Called by flags.set after upsert to force fresh DB lookup on next isEnabled call.
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * bustFlag — invalidate cached entries for a specific flag (all scope variants).
   * More targeted than clearCache; used internally after flags.set for a single flag.
   */
  bustFlag(flag: FeatureFlagName): void {
    for (const key of this._cache.keys()) {
      if (key.endsWith(`:${flag}`)) {
        this._cache.delete(key);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private _cacheKey(flag: FeatureFlagName, ctx?: { orgId?: string; userId?: string }): string {
    const orgKey = ctx?.orgId ?? "global";
    const userKey = ctx?.userId ?? "global";
    return `${orgKey}:${userKey}:${flag}`;
  }

  /**
   * _resolve — actual resolution logic (no caching layer).
   *
   * Lookup order in DB:
   *   1. Per-user row (orgId + userId + flag) if userId provided.
   *   2. Per-org row (orgId + flag) if orgId provided (userId IS NULL).
   *   3. Global row (orgId IS NULL, userId IS NULL, flag).
   *
   * If any DB row is found → return its `enabled` value (even if false).
   * If no DB row → check FULCRUM_FEATURES env var.
   * If not in env var → return false.
   */
  private async _resolve(
    flag: FeatureFlagName,
    ctx?: { orgId?: string; userId?: string },
  ): Promise<boolean> {
    const { orgId, userId } = ctx ?? {};

    // 1. DB lookup — most specific scope first
    try {
      let row = null;

      // Per-user scope (org + user + flag)
      if (orgId && userId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row = await this._flagRepo.findOne({ flag, orgId, userId } as any, {
          refresh: true,
        });
      }

      // Per-org scope (org + flag, no user)
      if (!row && orgId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row = await this._flagRepo.findOne({ flag, orgId, userId: null } as any, {
          refresh: true,
        });
      }

      // Global scope (no org, no user)
      if (!row) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row = await this._flagRepo.findOne({ flag, orgId: null, userId: null } as any, {
          refresh: true,
        });
      }

      // DB row found — return its value (repo wins over env var)
      if (row !== null) {
        return row.enabled;
      }
    } catch {
      // Repo unavailable (e.g. test without DB, CLI before migration) — fall through to env
    }

    // 2. FULCRUM_FEATURES env var
    const envFlags = (process.env["FULCRUM_FEATURES"] ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    if (envFlags.includes(flag)) {
      return true;
    }

    // 3. Default off
    return false;
  }
}
