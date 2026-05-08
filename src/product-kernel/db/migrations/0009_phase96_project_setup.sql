-- Phase 09.6 Plan 01: project hierarchy and setup policy metadata.
-- Additive only; safe for existing local databases.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_id text REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS module_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS workflow_id text;

CREATE INDEX IF NOT EXISTS projects_org_parent_idx
  ON projects (org_id, parent_id);

CREATE INDEX IF NOT EXISTS projects_org_path_idx
  ON projects (org_id, path);

CREATE INDEX IF NOT EXISTS repos_org_project_idx
  ON repos (org_id, project_id);
