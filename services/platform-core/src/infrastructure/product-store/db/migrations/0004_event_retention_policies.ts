import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_event_retention_policies.sql",
  sql: "-- Event retention policies for audit log retention management.\n-- retain_days=0 means keep forever (no pruning).\n\nCREATE TABLE IF NOT EXISTS event_retention_policies (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  project_id text REFERENCES projects(id),\n  retain_days integer NOT NULL DEFAULT 0,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (org_id, project_id)\n);\n\nCREATE INDEX IF NOT EXISTS event_retention_policies_org_idx\n  ON event_retention_policies (org_id);\n",
};
