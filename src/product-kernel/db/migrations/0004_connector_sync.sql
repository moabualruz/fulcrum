-- Connector sync infrastructure: external_id on documents + connector_sync_log table.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS documents_external_id_idx ON documents (external_id) WHERE external_id IS NOT NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS scope text;

CREATE TABLE IF NOT EXISTS connector_sync_log (
  id text PRIMARY KEY,
  connector text NOT NULL,
  org_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_synced integer NOT NULL DEFAULT 0,
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS connector_sync_log_connector_idx ON connector_sync_log (connector, org_id, started_at);
