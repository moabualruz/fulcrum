import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_agent_profiles.sql",
  sql: "-- Agent profile registry: one row per supported agent CLI.\n\nCREATE TABLE IF NOT EXISTS agent_profiles (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  name text NOT NULL,\n  cli_path text NOT NULL,\n  default_flags text NOT NULL DEFAULT '',\n  auth_env_vars jsonb NOT NULL DEFAULT '[]'::jsonb,\n  test_passed boolean,\n  last_tested_at timestamptz,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (org_id, name)\n);\n",
};
