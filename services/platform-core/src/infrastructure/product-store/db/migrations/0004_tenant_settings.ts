import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_tenant_settings.sql",
  sql: "-- Tenant-scoped key-value settings (locale preferences, feature knobs, etc.)\nCREATE TABLE IF NOT EXISTS tenant_settings (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  key text NOT NULL,\n  value jsonb NOT NULL DEFAULT '{}'::jsonb,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (org_id, key)\n);\n\nALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS id text;\nALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();\nALTER TABLE tenant_settings ALTER COLUMN value TYPE jsonb USING value::jsonb;\nALTER TABLE tenant_settings ALTER COLUMN value SET DEFAULT '{}'::jsonb;\n\nCREATE INDEX IF NOT EXISTS tenant_settings_org_key_idx ON tenant_settings (org_id, key);\n",
};
