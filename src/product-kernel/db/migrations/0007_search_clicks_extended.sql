-- P11#16: Extend search_clicks with query_hash and position columns.
-- query_hash: SHA-256(orgId + queryText + sortedFilters) for stable grouping.
-- position: 0-based rank of clicked result in search results list.

ALTER TABLE search_clicks
  ADD COLUMN IF NOT EXISTS query_hash text;

ALTER TABLE search_clicks
  ADD COLUMN IF NOT EXISTS position integer;

CREATE INDEX IF NOT EXISTS search_clicks_query_hash_idx
  ON search_clicks (org_id, query_hash);
