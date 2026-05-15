import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_repo_sync.sql",
  sql: "-- Repo sync metadata: track sync state, errors, and mirror disk usage.\n\nALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle'\n  CHECK (sync_status IN ('idle', 'syncing', 'error'));\nALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_error text;\nALTER TABLE repos ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;\nALTER TABLE repos ADD COLUMN IF NOT EXISTS mirror_path text;\nALTER TABLE repos ADD COLUMN IF NOT EXISTS mirror_size_bytes bigint NOT NULL DEFAULT 0;\n",
};
