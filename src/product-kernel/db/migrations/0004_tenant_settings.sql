-- Tenant-scoped key-value settings (locale preferences, feature knobs, etc.)
CREATE TABLE IF NOT EXISTS tenant_settings (
  org_id   text NOT NULL REFERENCES orgs(id),
  key      text NOT NULL,
  value    text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
