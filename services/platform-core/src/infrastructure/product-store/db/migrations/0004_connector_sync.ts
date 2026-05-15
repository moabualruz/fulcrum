import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_connector_sync.sql",
  sql: "-- Connector sync infrastructure: external_id on documents + connector_sync_log table.\n\nALTER TABLE documents ADD COLUMN IF NOT EXISTS external_id text;\nCREATE UNIQUE INDEX IF NOT EXISTS documents_external_id_idx ON documents (external_id) WHERE external_id IS NOT NULL;\n\nALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type text;\nALTER TABLE documents ADD COLUMN IF NOT EXISTS scope text;\n\nCREATE TABLE IF NOT EXISTS connector_sync_log (\n  id text PRIMARY KEY,\n  connector text NOT NULL,\n  org_id text NOT NULL,\n  started_at timestamptz NOT NULL DEFAULT now(),\n  finished_at timestamptz,\n  pages_synced integer NOT NULL DEFAULT 0,\n  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb\n);\n\nCREATE INDEX IF NOT EXISTS connector_sync_log_connector_idx ON connector_sync_log (connector, org_id, started_at);\n",
};
