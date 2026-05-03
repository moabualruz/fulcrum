-- Add columns used by the web repos dashboard (slice 09) and project-scoped
-- repos view (slice 12). Also adds repo_id FK on tasks.

ALTER TABLE repos ADD COLUMN IF NOT EXISTS name varchar(255) NOT NULL DEFAULT '';
ALTER TABLE repos ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT 'local';
ALTER TABLE repos ADD COLUMN IF NOT EXISTS local_path text;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS current_branch varchar(255);
ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_status varchar(10) NOT NULL DEFAULT 'idle';
ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_touched_at timestamptz;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repo_id text REFERENCES repos(id);
