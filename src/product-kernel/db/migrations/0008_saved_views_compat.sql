-- Saved views compatibility across settings/project-settings migrations.

ALTER TABLE saved_views ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS filters jsonb DEFAULT '{}'::jsonb;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS sort_by text;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS columns jsonb DEFAULT '[]'::jsonb;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS view_type text NOT NULL DEFAULT 'board';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_views' AND column_name = 'filter_ast'
  ) THEN
    UPDATE saved_views
    SET filters = filter_ast
    WHERE filters = '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS saved_views_scope_idx
  ON saved_views (org_id, project_id, view_type);
