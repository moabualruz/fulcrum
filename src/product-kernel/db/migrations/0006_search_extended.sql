-- P11#01: Search & Discovery schema extension.
-- Adds: metadata column + GIN index on search_documents, unique constraint on
-- (org_id, source_kind, source_id), search_clicks telemetry table, saved_views
-- table with view_type supporting 'search'.

-- 1. Extend search_documents with metadata jsonb (for facet queries).
ALTER TABLE search_documents
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. GIN index on metadata for facet queries.
CREATE INDEX IF NOT EXISTS search_documents_metadata_idx
  ON search_documents USING gin (metadata);

-- 3. Unique constraint on (org_id, source_kind, source_id) — idempotent via
--    DO $$ block (pg doesn't support IF NOT EXISTS on constraints).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'search_documents_org_kind_entity_uniq'
      AND conrelid = 'search_documents'::regclass
  ) THEN
    ALTER TABLE search_documents
      ADD CONSTRAINT search_documents_org_kind_entity_uniq
      UNIQUE (org_id, source_kind, source_id);
  END IF;
END $$;

-- Drop the old un-scoped unique constraint if it exists (from 0002_search.sql).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'search_documents_source_kind_source_id_key'
      AND conrelid = 'search_documents'::regclass
  ) THEN
    ALTER TABLE search_documents
      DROP CONSTRAINT search_documents_source_kind_source_id_key;
  END IF;
END $$;

-- 4. search_clicks — telemetry table; writes gated behind feature flag at runtime.
CREATE TABLE IF NOT EXISTS search_clicks (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  query text NOT NULL,
  result_kind text NOT NULL,
  result_id text NOT NULL,
  rank integer,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_clicks_scope_idx
  ON search_clicks (org_id, project_id, clicked_at);

-- 5. saved_views — persisted view configs; view_type text column accepts any
--    string including 'search', 'board', 'list', etc.
CREATE TABLE IF NOT EXISTS saved_views (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  view_type text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_views_scope_idx
  ON saved_views (org_id, project_id, view_type);
