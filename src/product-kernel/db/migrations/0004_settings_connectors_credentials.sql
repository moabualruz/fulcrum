-- Settings, connector runs, and credentials tables for P15#15.

CREATE TABLE IF NOT EXISTS tenant_settings (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE INDEX IF NOT EXISTS tenant_settings_org_idx ON tenant_settings (org_id);

CREATE TABLE IF NOT EXISTS connector_runs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error text,
  records_synced integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS connector_runs_org_kind_idx ON connector_runs (org_id, kind, started_at DESC);

CREATE TABLE IF NOT EXISTS credentials (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  key text NOT NULL,
  encrypted_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE INDEX IF NOT EXISTS credentials_org_idx ON credentials (org_id);
