-- FTS read model populated from source rows.

CREATE TABLE IF NOT EXISTS search_documents (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  project_id text,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  labels text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED,
  UNIQUE (source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS search_documents_vector_idx ON search_documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS search_documents_scope_idx ON search_documents (org_id, project_id, source_kind);
