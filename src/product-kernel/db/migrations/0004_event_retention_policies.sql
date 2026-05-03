-- Event retention policies for audit log retention management.
-- retain_days=0 means keep forever (no pruning).

CREATE TABLE IF NOT EXISTS event_retention_policies (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  retain_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);

CREATE INDEX IF NOT EXISTS event_retention_policies_org_idx
  ON event_retention_policies (org_id);
