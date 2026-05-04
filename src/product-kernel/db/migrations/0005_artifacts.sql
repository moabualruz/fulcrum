-- Extends the artifacts table with full production columns and composite indexes.
-- Adds artifact_retention_days to projects.
-- Migration is additive (ADD COLUMN IF NOT EXISTS) — safe to re-apply.
-- Requires: artifacts table from 0001_product_kernel.sql baseline.

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS filename         text,
  ADD COLUMN IF NOT EXISTS size_bytes       bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS path             text,
  ADD COLUMN IF NOT EXISTS checksum_sha256  text,
  ADD COLUMN IF NOT EXISTS metadata_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_until  timestamptz;

-- Composite indexes required by Q22 and Q35.
CREATE INDEX IF NOT EXISTS artifacts_org_project_date
  ON artifacts (org_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS artifacts_org_run
  ON artifacts (org_id, run_id);

CREATE INDEX IF NOT EXISTS artifacts_org_task
  ON artifacts (org_id, task_id);

CREATE INDEX IF NOT EXISTS artifacts_checksum
  ON artifacts (checksum_sha256);

CREATE INDEX IF NOT EXISTS artifacts_retention
  ON artifacts (retention_until)
  WHERE retention_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS artifacts_org_archived_date
  ON artifacts (org_id, archived, created_at DESC);

-- Projects amendment: per-project artifact retention policy (NULL = keep forever).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS artifact_retention_days integer;
