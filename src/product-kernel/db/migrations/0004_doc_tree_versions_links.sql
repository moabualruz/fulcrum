-- Doc tree (parent_id), document versions, and doc links for backlinks.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id text REFERENCES documents(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS documents_parent_idx ON documents (parent_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id text PRIMARY KEY,
  doc_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES orgs(id),
  version integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  author text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, version)
);

CREATE INDEX IF NOT EXISTS document_versions_doc_idx ON document_versions (doc_id, version);

CREATE TABLE IF NOT EXISTS doc_links (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  source_doc_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_doc_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'wikilink',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_doc_id, target_doc_id, link_type)
);

CREATE INDEX IF NOT EXISTS doc_links_target_idx ON doc_links (target_doc_id);
