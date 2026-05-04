-- Skills registry: installed skills with metadata, enabled agents, and conflict state.

CREATE TABLE IF NOT EXISTS skills (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  slug text NOT NULL,
  version text NOT NULL DEFAULT '0.0.0',
  source text NOT NULL CHECK (source IN ('local', 'upstream')),
  upstream_repo text,
  content_hash text,
  enabled_agents jsonb NOT NULL DEFAULT '[]'::jsonb,
  upstream_conflict jsonb,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS skills_org_idx ON skills (org_id);
