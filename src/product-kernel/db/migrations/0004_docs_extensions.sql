-- Docs extensions: add columns to documents table + connector_sync_log table.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id text REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('project', 'global'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'note' CHECK (doc_type IN ('spec', 'adr', 'wiki', 'runbook', 'meeting', 'postmortem', 'rfc', 'note', 'scratch'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS body_md text NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sort_position float8 NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS docs_org_external_id ON documents (org_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS docs_org_project_scope ON documents (org_id, project_id, scope);
CREATE INDEX IF NOT EXISTS docs_org_doc_type ON documents (org_id, doc_type);
CREATE INDEX IF NOT EXISTS docs_org_parent ON documents (org_id, parent_id);

CREATE TABLE IF NOT EXISTS connector_sync_log (
  id text PRIMARY KEY,
  connector text NOT NULL,
  org_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_synced integer NOT NULL DEFAULT 0,
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS connector_sync_log_org_idx ON connector_sync_log (org_id, connector, started_at DESC);
