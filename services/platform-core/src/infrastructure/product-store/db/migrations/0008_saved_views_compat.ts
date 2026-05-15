import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0008_saved_views_compat.sql",
  sql: "-- Saved views compatibility across settings/project-settings migrations.\n\nALTER TABLE saved_views ALTER COLUMN project_id DROP NOT NULL;\nALTER TABLE saved_views ADD COLUMN IF NOT EXISTS filters jsonb DEFAULT '{}'::jsonb;\nALTER TABLE saved_views ADD COLUMN IF NOT EXISTS sort_by text;\nALTER TABLE saved_views ADD COLUMN IF NOT EXISTS columns jsonb DEFAULT '[]'::jsonb;\nALTER TABLE saved_views ADD COLUMN IF NOT EXISTS owner_id text;\nALTER TABLE saved_views ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;\nALTER TABLE saved_views ADD COLUMN IF NOT EXISTS view_type text NOT NULL DEFAULT 'board';\n\nDO $$ BEGIN\n  IF EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'saved_views' AND column_name = 'filter_ast'\n  ) THEN\n    UPDATE saved_views\n    SET filters = filter_ast\n    WHERE filters = '{}'::jsonb;\n  END IF;\nEND $$;\n\nCREATE INDEX IF NOT EXISTS saved_views_scope_idx\n  ON saved_views (org_id, project_id, view_type);\n",
};
