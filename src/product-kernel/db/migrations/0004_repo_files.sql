-- Repo file tree index: stores file metadata per repo+branch for tree browsing,
-- content viewing, and blame. Populated by sync workers; consumed by web routes.

CREATE TABLE IF NOT EXISTS repo_files_index (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  branch text NOT NULL,
  path text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('file', 'directory')),
  mime text,
  size_bytes integer,
  sha text,
  parent_path text,
  depth integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, branch, path)
);

CREATE INDEX IF NOT EXISTS repo_files_repo_branch_parent
  ON repo_files_index (repo_id, branch, parent_path);

CREATE INDEX IF NOT EXISTS repo_files_repo_branch_path
  ON repo_files_index (repo_id, branch, path);

-- Blame data: per-line blame info for files. Populated by sync workers.
CREATE TABLE IF NOT EXISTS repo_file_blame (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  branch text NOT NULL,
  path text NOT NULL,
  line_number integer NOT NULL,
  commit_sha text NOT NULL,
  author text NOT NULL,
  author_date timestamptz NOT NULL,
  line_content text NOT NULL,
  UNIQUE (repo_id, branch, path, line_number)
);

CREATE INDEX IF NOT EXISTS repo_file_blame_lookup
  ON repo_file_blame (repo_id, branch, path);

-- File content cache: stores text content for viewing. Binary content stored
-- as download path reference only.
CREATE TABLE IF NOT EXISTS repo_file_content (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  branch text NOT NULL,
  path text NOT NULL,
  content text,
  is_binary boolean NOT NULL DEFAULT false,
  encoding text DEFAULT 'utf-8',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, branch, path)
);
