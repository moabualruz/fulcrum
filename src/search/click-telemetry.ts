/**
 * P11#16 — Search click telemetry.
 *
 * Gated behind `search-click-telemetry` feature flag.
 * Writes to `search_clicks` table when flag ON; no-op when OFF.
 *
 * query_hash: SHA-256(orgId + queryText + JSON.stringify(sortedFilters))
 * — stable across same query.
 */

import type { ProductDb } from "../product-kernel/db/types.ts";
import { newUlid } from "../product-kernel/ids.ts";

export interface RecordClickInput {
  orgId: string;
  projectId?: string | null;
  query: string;
  filters?: Record<string, unknown>;
  resultKind: string;
  resultId: string;
  position: number;
}

/**
 * Compute query_hash: SHA-256(orgId + queryText + JSON.stringify(sortedFilters)).
 */
export async function computeQueryHash(
  orgId: string,
  queryText: string,
  filters: Record<string, unknown> = {},
): Promise<string> {
  const sortedFilters = JSON.stringify(filters, Object.keys(filters).sort());
  const input = `${orgId}${queryText}${sortedFilters}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use Web Crypto API (available in Bun, Node 18+, browsers)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Record a search click. Writes to search_clicks table.
 * Caller is responsible for checking feature flag before calling.
 */
export async function recordSearchClick(
  db: ProductDb,
  input: RecordClickInput,
): Promise<void> {
  const id = newUlid();
  const queryHash = await computeQueryHash(
    input.orgId,
    input.query,
    input.filters ?? {},
  );

  await db.query(
    `INSERT INTO search_clicks (id, org_id, project_id, query, query_hash, result_kind, result_id, rank, position, clicked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.query,
      queryHash,
      input.resultKind,
      input.resultId,
      input.position, // rank = position for backward compat
      input.position,
    ],
  );
}
