-- Embeddings column on tasks + sprints table for scrum features.
-- Embedding stored as jsonb float array for PGlite compat; production Postgres
-- with pgvector should use: ALTER TABLE tasks ADD COLUMN embedding vector(1536).

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS embedding jsonb;

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  status text NOT NULL CHECK (status IN ('planning', 'active', 'closed')),
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent: add columns missing if a prior migration created a minimal sprints table.
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS goal text;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS status text DEFAULT 'planning';
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS sprints_scope_idx ON sprints (org_id, project_id, status);

-- Link tasks to sprints (many-to-one for simplicity).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id);
