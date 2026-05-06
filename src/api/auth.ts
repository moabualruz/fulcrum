/**
 * Unified auth middleware for the public REST API.
 * Supports Bearer API-key auth (SHA-256 hash lookup).
 *
 * Consolidated from product-kernel/api/router.ts authMiddleware.
 */

import type { Context, Next } from "hono";
import type { ProductDb } from "../product-kernel/db/types.ts";
import { findApiKeyByHash } from "../product-kernel/store/repositories.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface ApiEnv {
  Variables: {
    db: ProductDb;
    orgId: string;
    userId: string;
    trpc?: unknown;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Middleware ────────────────────────────────────────────────────────

/**
 * Bearer API-key authentication middleware.
 * Looks up the key hash in the api_keys table and sets orgId + userId.
 */
export function apiKeyAuth() {
  return async (c: Context, next: Next) => {
    const db: ProductDb = c.get("db");
    const authHeader = c.req.header("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const keyHash = await hashKey(token);
      const apiKey = await findApiKeyByHash(db, keyHash);
      if (!apiKey) {
        return c.json({ error: "invalid API key" }, 401);
      }
      c.set("orgId", apiKey.org_id);
      c.set("userId", apiKey.user_id);
      return next();
    }

    return c.json({ error: "authentication required" }, 401);
  };
}
