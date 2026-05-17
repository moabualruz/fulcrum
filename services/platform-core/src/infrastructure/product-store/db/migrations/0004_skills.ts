import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_skills.sql",
  sql: "-- Skills registry: installed skills with metadata, enabled agents, and conflict state.\n\nCREATE TABLE IF NOT EXISTS skills (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  slug text NOT NULL,\n  version text NOT NULL DEFAULT '0.0.0',\n  source text NOT NULL CHECK (source IN ('local', 'upstream')),\n  upstream_repo text,\n  content_hash text,\n  enabled_agents jsonb NOT NULL DEFAULT '[]'::jsonb,\n  upstream_conflict jsonb,\n  installed_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (org_id, slug)\n);\n\nCREATE INDEX IF NOT EXISTS skills_org_idx ON skills (org_id);\n",
};
