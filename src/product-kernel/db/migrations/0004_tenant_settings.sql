-- Tenant-scoped key-value settings (locale preferences, feature knobs, etc.)
CREATE TABLE IF NOT EXISTS tenant_settings (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE tenant_settings ALTER COLUMN value TYPE jsonb USING value::jsonb;
ALTER TABLE tenant_settings ALTER COLUMN value SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS tenant_settings_org_key_idx ON tenant_settings (org_id, key);
