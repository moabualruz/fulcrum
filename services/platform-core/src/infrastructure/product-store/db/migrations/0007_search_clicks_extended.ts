import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0007_search_clicks_extended.sql",
  sql: "-- P11#16: Extend search_clicks with query_hash and position columns.\n-- query_hash: SHA-256(orgId + queryText + sortedFilters) for stable grouping.\n-- position: 0-based rank of clicked result in search results list.\n\nALTER TABLE search_clicks\n  ADD COLUMN IF NOT EXISTS query_hash text;\n\nALTER TABLE search_clicks\n  ADD COLUMN IF NOT EXISTS position integer;\n\nCREATE INDEX IF NOT EXISTS search_clicks_query_hash_idx\n  ON search_clicks (org_id, query_hash);\n",
};
