-- Repo sync metadata: track sync state, errors, and mirror disk usage.

ALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle'
  CHECK (sync_status IN ('idle', 'syncing', 'error'));
ALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_error text;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS mirror_path text;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS mirror_size_bytes bigint NOT NULL DEFAULT 0;
