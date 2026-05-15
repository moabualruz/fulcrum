import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_repos_columns_and_task_repo_fk.sql",
  sql: "-- Add columns used by the web repos dashboard (slice 09) and project-scoped\n-- repos view (slice 12). Also adds repo_id FK on tasks.\n\nALTER TABLE repos ADD COLUMN IF NOT EXISTS name varchar(255) NOT NULL DEFAULT '';\nALTER TABLE repos ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT 'local';\nALTER TABLE repos ADD COLUMN IF NOT EXISTS local_path text;\nALTER TABLE repos ADD COLUMN IF NOT EXISTS current_branch varchar(255);\nALTER TABLE repos ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;\nALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_status varchar(10) NOT NULL DEFAULT 'idle';\nALTER TABLE repos ADD COLUMN IF NOT EXISTS last_touched_at timestamptz;\nALTER TABLE repos ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;\n\nALTER TABLE tasks ADD COLUMN IF NOT EXISTS repo_id text REFERENCES repos(id);\n",
};
