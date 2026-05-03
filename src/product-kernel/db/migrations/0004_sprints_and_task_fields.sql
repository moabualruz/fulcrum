-- Task assignee + custom fields + saved views (P14#06).

-- Fix NOT NULL on sprints.title added by 0004_connectors — the canonical column
-- is "name" (from 0004_sprints); "title" is a leftover from the connectors migration.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sprints' AND column_name = 'title' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE sprints ALTER COLUMN title DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id text;

CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (assignee_id);

-- Custom fields table
CREATE TABLE IF NOT EXISTS custom_fields (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'date', 'checkbox')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

-- Idempotent: add position column if custom_fields was created by a prior migration.
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS position integer DEFAULT 0;

-- Saved views table
CREATE TABLE IF NOT EXISTS saved_views (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_by text,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

-- Idempotent: add columns if saved_views was created by a prior migration.
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS columns jsonb DEFAULT '[]'::jsonb;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- Fix NOT NULL on scope — allow insert without scope.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_views' AND column_name = 'scope' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE saved_views ALTER COLUMN scope SET DEFAULT 'project';
  END IF;
END $$;
