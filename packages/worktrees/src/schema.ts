// packages/worktrees/src/schema.ts
import type Database from 'better-sqlite3'

export function runMigration008(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id   TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id    TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id    TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      title         TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      owner_type    TEXT NOT NULL,
      owner_id      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','final','archived')),
      content_hash  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts
      USING fts5(title, content='artifacts', content_rowid='rowid',
                 tokenize='porter unicode61');

    CREATE TABLE IF NOT EXISTS reviews (
      review_id          TEXT PRIMARY KEY,
      workspace_id       TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id         TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id         TEXT NOT NULL,
      target_type        TEXT NOT NULL CHECK(target_type IN ('task','artifact','worktree')),
      target_id          TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','changes_requested','approved','rejected')),
      reviewer_agent_id  TEXT,
      summary            TEXT,
      file_path          TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS worktrees (
      worktree_id  TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'allocated'
        CHECK(status IN ('allocated','dirty','ready_for_merge','merged','discarded')),
      branch_name  TEXT NOT NULL,
      path         TEXT NOT NULL,
      task_id      TEXT REFERENCES tasks(task_id),
      run_id       TEXT REFERENCES agent_runs(run_id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      merged_at    TEXT,
      discarded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS artifact_contracts (
      contract_id            TEXT PRIMARY KEY,
      task_id                TEXT REFERENCES tasks(task_id),
      required_artifacts     TEXT NOT NULL DEFAULT '[]',
      optional_artifacts     TEXT NOT NULL DEFAULT '[]',
      final_summary_artifact TEXT,
      review_inputs          TEXT NOT NULL DEFAULT '[]',
      merge_readiness_rules  TEXT NOT NULL DEFAULT '[]',
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      handoff_id           TEXT PRIMARY KEY,
      workspace_id         TEXT NOT NULL,
      project_id           TEXT NOT NULL,
      from_agent_id        TEXT NOT NULL,
      to_agent_id          TEXT NOT NULL,
      task_id              TEXT REFERENCES tasks(task_id),
      issue_id             TEXT REFERENCES issues(issue_id),
      goal                 TEXT NOT NULL,
      task_type            TEXT,
      priority             TEXT NOT NULL DEFAULT 'medium',
      scope                TEXT NOT NULL,
      inputs               TEXT NOT NULL DEFAULT '{}',
      constraints          TEXT NOT NULL DEFAULT '[]',
      done_criteria        TEXT NOT NULL DEFAULT '[]',
      artifact_contract_id TEXT REFERENCES artifact_contracts(contract_id),
      handoff_mode         TEXT NOT NULL DEFAULT 'artifact_first_brief'
        CHECK(handoff_mode IN ('brief','contextual','artifact_first_brief','branched_session')),
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentrun_artifacts (
      run_id      TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      PRIMARY KEY (run_id, artifact_id)
    );

    CREATE TABLE IF NOT EXISTS review_targets (
      review_id   TEXT NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      PRIMARY KEY (review_id, artifact_id)
    );

    CREATE TABLE IF NOT EXISTS task_memory_links (
      task_id   TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      memory_id TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, memory_id)
    );

    CREATE TABLE IF NOT EXISTS artifact_memory_links (
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      memory_id   TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
      PRIMARY KEY (artifact_id, memory_id)
    );
  `)
}
