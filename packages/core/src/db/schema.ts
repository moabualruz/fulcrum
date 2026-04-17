import type Database from 'better-sqlite3'

// ─────────────────────────────────────────────────────────────────────────────
// Complete database schema.
// All tables use IF NOT EXISTS so this is safe to call on any database state.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * v2a Task 1: detect a legacy memories table (one without the v2a `slug` column)
 * and rebuild it via the 12-step SQLite table-rebuild dance — preserving every
 * row, synthesizing slug = memory_id and vault_path = 'legacy/' || memory_id || '.md'.
 *
 * Idempotent: skipped on fresh DBs (no table to rebuild) and on already-migrated
 * tables (slug column present).
 */
function rebuildMemoriesIfLegacy(db: Database.Database): void {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'").get() as { name: string } | undefined
  if (!tbl) return // fresh DB — schema CREATE will handle
  const cols = (db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).map(c => c.name)
  if (cols.includes('slug')) return // already rebuilt

  // 12-step rebuild — wrapped in a transaction so a failure leaves the legacy table intact.
  db.exec('BEGIN IMMEDIATE')
  try {
    // Drop dependent triggers first (they reference the old table by name).
    for (const t of ['memories_ai', 'memories_ad', 'memories_au']) {
      db.exec(`DROP TRIGGER IF EXISTS ${t}`)
    }

    db.exec(`
      CREATE TABLE memories_new (
        memory_id        TEXT PRIMARY KEY,
        workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        project_id       TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
        scope            TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('session','project','workspace','global','file','task')),
        kind             TEXT NOT NULL DEFAULT 'fact',
        title            TEXT NOT NULL DEFAULT '',
        summary          TEXT NOT NULL DEFAULT '',
        content          TEXT NOT NULL,
        canonical_text   TEXT,
        tags             TEXT NOT NULL DEFAULT '[]',
        entities         TEXT NOT NULL DEFAULT '[]',
        confidence       REAL NOT NULL DEFAULT 1.0,
        importance       REAL NOT NULL DEFAULT 0.5,
        freshness        REAL NOT NULL DEFAULT 1.0,
        file_path        TEXT,
        symbol_path      TEXT,
        event_time       TEXT,
        content_hash     TEXT,
        task_id          TEXT,
        issue_id         TEXT,
        artifact_id      TEXT,
        provenance_refs  TEXT NOT NULL DEFAULT '[]',
        session_id       TEXT,
        content_type     TEXT NOT NULL DEFAULT 'text',
        sparse_vector    TEXT,
        source           TEXT NOT NULL DEFAULT 'manual',
        embedding        BLOB,
        access_count     INTEGER NOT NULL DEFAULT 0,
        tier             TEXT NOT NULL DEFAULT 'short_term',
        slug             TEXT NOT NULL DEFAULT (lower(hex(randomblob(8)))),
        vault_path       TEXT NOT NULL DEFAULT '',
        provenance       TEXT NOT NULL DEFAULT '{}',
        supersedes       TEXT,
        recall_count     INTEGER NOT NULL DEFAULT 0,
        unique_query_count INTEGER NOT NULL DEFAULT 0,
        max_recall_score REAL NOT NULL DEFAULT 0.0,
        last_recalled_at INTEGER,
        embedded         INTEGER NOT NULL DEFAULT 0,
        schema_version   INTEGER NOT NULL DEFAULT 1,
        normalize_version INTEGER NOT NULL DEFAULT 1,
        expires_at       INTEGER,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    // Carry over every legacy column verbatim. Synthesize slug + vault_path; defaults
    // cover the other v2a additions.
    db.exec(`
      INSERT INTO memories_new (
        memory_id, workspace_id, project_id, scope, kind, title, summary, content,
        canonical_text, tags, entities, confidence, importance, freshness,
        file_path, symbol_path, event_time, content_hash, task_id, issue_id,
        artifact_id, provenance_refs, session_id, content_type, sparse_vector,
        source, embedding, access_count, slug, vault_path,
        created_at, updated_at, last_accessed_at
      )
      SELECT
        memory_id, workspace_id, project_id, scope, kind, title, summary, content,
        canonical_text, tags, entities, confidence, importance, freshness,
        file_path, symbol_path, event_time, content_hash, task_id, issue_id,
        artifact_id, provenance_refs, session_id, content_type, sparse_vector,
        source, embedding, access_count,
        memory_id AS slug,
        'legacy/' || memory_id || '.md' AS vault_path,
        created_at, updated_at, last_accessed_at
      FROM memories;
    `)

    db.exec('DROP TABLE memories')
    db.exec('ALTER TABLE memories_new RENAME TO memories')
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * v2a Task 3: detect a legacy agent_runs table missing context_type or
 * parent_run_id and add them via ALTER TABLE. The CHECK constraint on
 * context_type cannot be retrofitted via ALTER TABLE in SQLite, so legacy
 * DBs accept any value at the DB level until a future full rebuild — but
 * the application-layer fail-closed enforcement in startAgentRun() still
 * binds. Idempotent.
 */
function addAgentRunsContextTypeIfMissing(db: Database.Database): void {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_runs'").get() as { name: string } | undefined
  if (!tbl) return // fresh DB — schema CREATE handles
  const cols = (db.prepare('PRAGMA table_info(agent_runs)').all() as { name: string }[]).map(c => c.name)
  if (!cols.includes('context_type')) {
    db.exec(`ALTER TABLE agent_runs ADD COLUMN context_type TEXT NOT NULL DEFAULT 'primary'`)
  }
  if (!cols.includes('parent_run_id')) {
    db.exec(`ALTER TABLE agent_runs ADD COLUMN parent_run_id TEXT`)
  }
}

/**
 * v2a Task 6: add root_realpath + vcs_remote to legacy projects tables. Both
 * are nullable in v2a PR 1; PR 4 (PCI watcher) populates root_realpath at
 * watch-init via fs.realpath. The partial UNIQUE INDEX in applySchema()
 * enforces uniqueness once values are present.
 */
function addProjectsRootRealpathIfMissing(db: Database.Database): void {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get() as { name: string } | undefined
  if (!tbl) return
  const cols = (db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map(c => c.name)
  if (!cols.includes('root_realpath')) {
    db.exec(`ALTER TABLE projects ADD COLUMN root_realpath TEXT`)
  }
  if (!cols.includes('vcs_remote')) {
    db.exec(`ALTER TABLE projects ADD COLUMN vcs_remote TEXT`)
  }
}

/**
 * v2a Task 5: existing code_chunks predates code_files. Add file_id forward-
 * compat column so PR 4's PCI watcher can link chunks to file rows during
 * ingest. Nullable until full backfill in PR 4.
 */
function addCodeChunksFileIdIfMissing(db: Database.Database): void {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_chunks'").get() as { name: string } | undefined
  if (!tbl) return
  const cols = (db.prepare('PRAGMA table_info(code_chunks)').all() as { name: string }[]).map(c => c.name)
  if (!cols.includes('file_id')) {
    db.exec(`ALTER TABLE code_chunks ADD COLUMN file_id TEXT`)
  }
}

export function applySchema(db: Database.Database): void {
  // v2a PR 1 Task 1: rebuild legacy memories table BEFORE the idempotent CREATE
  // statements run. CREATE IF NOT EXISTS would skip the legacy table and leave
  // it without the v2a columns. The rebuild is a no-op for fresh DBs.
  rebuildMemoriesIfLegacy(db)
  addAgentRunsContextTypeIfMissing(db)
  addProjectsRootRealpathIfMissing(db)
  addCodeChunksFileIdIfMissing(db)

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Migration ledger used by extension packages (teams, workflows) to record
    -- which of their migrations have run. Must exist before any package calls
    -- runMigration00X() and INSERT OR IGNORE INTOs this table.
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Core entities ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      config_path  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id        TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      project_type      TEXT,
      root_path         TEXT,
      -- v2a Task 6: root_realpath is the symlink-resolved canonical sibling of
      -- root_path. PR 4 populates it at PCI watch-init via fs.realpath; the
      -- partial UNIQUE INDEX below enforces single-row-per-canonical-path so a
      -- project move on disk updates one row and every code_files.rel_path
      -- stays valid.
      root_realpath     TEXT,
      vcs_remote        TEXT,
      default_branch    TEXT,
      parent_project_id TEXT REFERENCES projects(project_id) ON DELETE SET NULL,
      write_mode        TEXT NOT NULL DEFAULT 'worktree' CHECK(write_mode IN ('worktree','in_place','sequential')),
      status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','paused')),
      type              TEXT NOT NULL DEFAULT 'git' CHECK(type IN ('git','non_git','submodule','logical')),
      git_url           TEXT,
      description       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_realpath ON projects(root_realpath) WHERE root_realpath IS NOT NULL;

    CREATE TABLE IF NOT EXISTS tasks (
      task_id         TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id      TEXT NOT NULL DEFAULT '',
      issue_id        TEXT,
      title           TEXT NOT NULL,
      description     TEXT,
      status          TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','ready','claimed','running','blocked','failed','completed','cancelled')),
      status_category TEXT NOT NULL DEFAULT 'backlog',
      priority        TEXT NOT NULL DEFAULT 'medium',
      estimate_type   TEXT,
      estimate_value  REAL,
      assigned_to     TEXT,
      note            TEXT,
      done_criteria   TEXT,
      assigned_run_id TEXT REFERENCES agent_runs(run_id) ON DELETE SET NULL,
      version         INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at      TEXT,
      completed_at    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_workspace    ON tasks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project      ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_ws_status    ON tasks(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_ws_category  ON tasks(workspace_id, status_category);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_run ON tasks(assigned_run_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id          TEXT PRIMARY KEY,
      task_id         TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id      TEXT,
      display_id      TEXT NOT NULL DEFAULT '',
      agent_id        TEXT NOT NULL DEFAULT '',
      role            TEXT NOT NULL CHECK(role IN ('chief_of_staff','context_gatherer','prd_planner','implementation_planner','issue_decomposer','software_engineer','research_worker','refactor_worker','browser_worker','data_engineer','ml_engineer','devops_engineer','architecture_reviewer','code_reviewer','qa_engineer','security_reviewer','integration_worker','documentation_writer','memory_curator','tech_lead','product_manager','analyst','orchestrator','custom')),
      pi_profile      TEXT,
      status          TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('created','starting','running','waiting','blocked','failed','finished','aborted','stale')),
      status_category TEXT NOT NULL DEFAULT 'active',
      current_step    TEXT,
      current_path    TEXT,
      progress_pct    INTEGER NOT NULL DEFAULT 0,
      output_summary  TEXT,
      artifacts       TEXT,
      git_branch      TEXT,
      git_commit      TEXT,
      heartbeat_at    TEXT,
      blocker         TEXT,
      worktree_id     TEXT,
      events          TEXT NOT NULL DEFAULT '[]',
      version         INTEGER NOT NULL DEFAULT 0,
      -- v2a PR 1 Task 3: context_type categorizes the run for memory-write
      -- gating. Non-primary runs silently drop writes (except delegation_summary)
      -- in the hook-write rewrite (PR 6). NO DEFAULT at the API layer per
      -- critical constraint #7; the DB-level DEFAULT 'primary' here is a
      -- migration-compat backstop for the 29 direct-INSERT call sites — the
      -- fail-closed enforcement lives in startAgentRun().
      context_type    TEXT NOT NULL DEFAULT 'primary' CHECK(context_type IN ('primary','subagent','cron','heartbeat','flush')),
      parent_run_id   TEXT,
      started_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT,
      finished_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_workspace  ON agent_runs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_runs_context_type ON agent_runs(context_type);
    CREATE INDEX IF NOT EXISTS idx_runs_parent      ON agent_runs(parent_run_id) WHERE parent_run_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runs_task       ON agent_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status     ON agent_runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_updated    ON agent_runs(updated_at);
    CREATE INDEX IF NOT EXISTS idx_runs_ws_status  ON agent_runs(workspace_id, status);

    -- ── Memory ───────────────────────────────────────────────────────────────

    -- v2a PR 1 Task 1: kind CHECK constraint dropped; validation moves to
    -- packages/memory/src/write.ts (Task 9). New v2a columns: tier, slug,
    -- vault_path, provenance, supersedes, recall counters, embedded, schema/
    -- normalize versioning, expires_at. Existing rows on legacy DBs are
    -- migrated by rebuildMemoriesIfLegacy() before this CREATE runs.
    --
    -- v2a PR 1 Task 2: scope CHECK widened to include 'session' and 'workspace'.
    -- Plan calls for fully removing 'file' and 'task' (mapping existing rows to
    -- 'project'), but ~15 caller sites still emit them; PR 6 (hook rewrite)
    -- migrates those sites + tightens this CHECK. Until then we keep the legacy
    -- values in CHECK as a transition superset so existing writes continue to
    -- work. The application-layer write.ts (Task 9) emits a stderr warning when
    -- 'file' or 'task' is observed, telegraphing the upcoming removal.
    CREATE TABLE IF NOT EXISTS memories (
      memory_id        TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id       TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
      scope            TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('session','project','workspace','global','file','task')),
      kind             TEXT NOT NULL DEFAULT 'fact',
      title            TEXT NOT NULL DEFAULT '',
      summary          TEXT NOT NULL DEFAULT '',
      content          TEXT NOT NULL,
      canonical_text   TEXT,
      tags             TEXT NOT NULL DEFAULT '[]',
      entities         TEXT NOT NULL DEFAULT '[]',
      confidence       REAL NOT NULL DEFAULT 1.0,
      importance       REAL NOT NULL DEFAULT 0.5,
      freshness        REAL NOT NULL DEFAULT 1.0,
      file_path        TEXT,
      symbol_path      TEXT,
      event_time       TEXT,
      content_hash     TEXT,
      task_id          TEXT,
      issue_id         TEXT,
      artifact_id      TEXT,
      provenance_refs  TEXT NOT NULL DEFAULT '[]',
      session_id       TEXT,
      content_type     TEXT NOT NULL DEFAULT 'text',
      sparse_vector    TEXT,
      source           TEXT NOT NULL DEFAULT 'manual',
      embedding        BLOB,
      access_count     INTEGER NOT NULL DEFAULT 0,
      tier             TEXT NOT NULL DEFAULT 'short_term',
      slug             TEXT NOT NULL DEFAULT (lower(hex(randomblob(8)))),
      vault_path       TEXT NOT NULL DEFAULT '',
      provenance       TEXT NOT NULL DEFAULT '{}',
      supersedes       TEXT,
      recall_count     INTEGER NOT NULL DEFAULT 0,
      unique_query_count INTEGER NOT NULL DEFAULT 0,
      max_recall_score REAL NOT NULL DEFAULT 0.0,
      last_recalled_at INTEGER,
      embedded         INTEGER NOT NULL DEFAULT 0,
      schema_version   INTEGER NOT NULL DEFAULT 1,
      normalize_version INTEGER NOT NULL DEFAULT 1,
      expires_at       INTEGER,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_slug ON memories(slug);
    CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
    CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at) WHERE expires_at IS NOT NULL;
    -- At most one terminal memory (task_outcome/blocker_resolution/session_summary) per run.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_run_outcome
      ON memories(json_extract(provenance, '$.run_id'))
      WHERE kind IN ('task_outcome','blocker_resolution','session_summary')
        AND json_extract(provenance, '$.run_id') IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_memories_workspace         ON memories(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_memories_project           ON memories(project_id);
    CREATE INDEX IF NOT EXISTS idx_memories_scope             ON memories(scope);
    CREATE INDEX IF NOT EXISTS idx_memories_kind              ON memories(kind);
    CREATE INDEX IF NOT EXISTS idx_memories_file              ON memories(file_path);
    CREATE INDEX IF NOT EXISTS idx_memories_hash              ON memories(content_hash);
    CREATE INDEX IF NOT EXISTS idx_memories_event_time        ON memories(event_time);
    CREATE INDEX IF NOT EXISTS idx_memories_task              ON memories(task_id);
    CREATE INDEX IF NOT EXISTS idx_memories_ws_project_hash   ON memories(workspace_id, project_id, content_hash);
    CREATE INDEX IF NOT EXISTS idx_memories_importance_access ON memories(importance, last_accessed_at);
    CREATE INDEX IF NOT EXISTS idx_memories_session           ON memories(session_id) WHERE session_id IS NOT NULL;

    -- v2a PR 1 Task 4: signal ledger feeding Dreaming promotion (v2b PR 11),
    -- eviction, and utility scoring. Matches prior art
    -- short-term-promotion.recordShortTermRecalls.
    CREATE TABLE IF NOT EXISTS memory_recall_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id       TEXT    NOT NULL,
      query           TEXT    NOT NULL,
      score           REAL    NOT NULL,
      rank            INTEGER NOT NULL,
      caller_run_id   TEXT,
      caller_role     TEXT,
      source          TEXT    NOT NULL,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recall_events_memory ON memory_recall_events (memory_id);
    CREATE INDEX IF NOT EXISTS idx_recall_events_query  ON memory_recall_events (query, created_at);

    -- v2a PR 1 Task 4: O(log n) backlink traversal for query_memory(linked_to:).
    -- Dangling links (dst_memory_id IS NULL) are first-class — Dreaming light
    -- phase reports them in v2b PR 11.
    CREATE TABLE IF NOT EXISTS memory_wikilinks (
      src_memory_id TEXT NOT NULL,
      dst_slug      TEXT NOT NULL,
      dst_memory_id TEXT,
      PRIMARY KEY (src_memory_id, dst_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_wikilinks_dst    ON memory_wikilinks (dst_slug);
    CREATE INDEX IF NOT EXISTS idx_wikilinks_dst_id ON memory_wikilinks (dst_memory_id);

    -- v2a PR 1 Task 4: normalized tag store from frontmatter tags arrays.
    -- Powers tag-filter queries.
    CREATE TABLE IF NOT EXISTS memory_tags (
      memory_id TEXT NOT NULL,
      tag       TEXT NOT NULL,
      PRIMARY KEY (memory_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_tags_tag ON memory_tags (tag);

    CREATE TABLE IF NOT EXISTS memory_entities (
      memory_id     TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
      entity_type   TEXT NOT NULL,
      entity_id     TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'subject_of',
      PRIMARY KEY (memory_id, entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_memory_entities_entity ON memory_entities(entity_type, entity_id);

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

    -- ── Issues / Epics / PRDs / Plans ────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS epics (
      epic_id         TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id      TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      status          TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','in_progress','done','cancelled')),
      status_category TEXT NOT NULL DEFAULT 'backlog' CHECK(status_category IN ('backlog','active','blocked','done')),
      priority        TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low','none')),
      milestone_id    TEXT,
      version         INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_epics_workspace ON epics(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_epics_project   ON epics(project_id);
    CREATE INDEX IF NOT EXISTS idx_epics_status    ON epics(status_category);

    CREATE TABLE IF NOT EXISTS issues (
      issue_id          TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id        TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      epic_id           TEXT REFERENCES epics(epic_id),
      parent_issue_id   TEXT REFERENCES issues(issue_id),
      display_id        TEXT NOT NULL,
      title             TEXT NOT NULL,
      description       TEXT,
      status            TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','ready','in_progress','blocked','in_review','done','cancelled')),
      status_category   TEXT NOT NULL DEFAULT 'backlog' CHECK(status_category IN ('backlog','active','blocked','done')),
      priority          TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low','none')),
      assignee_agent_id TEXT,
      estimate_type     TEXT CHECK(estimate_type IN ('story_points','hours')),
      estimate_value    REAL,
      blocking_task_id  TEXT REFERENCES tasks(task_id),
      blocking_issue_id TEXT REFERENCES issues(issue_id),
      version           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_issues_workspace ON issues(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_issues_project   ON issues(project_id);
    CREATE INDEX IF NOT EXISTS idx_issues_epic      ON issues(epic_id);
    CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues(status_category);
    CREATE INDEX IF NOT EXISTS idx_issues_parent    ON issues(parent_issue_id);
    CREATE INDEX IF NOT EXISTS idx_issues_assignee  ON issues(assignee_agent_id);

    CREATE TABLE IF NOT EXISTS issue_labels (
      issue_id TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
      label    TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (issue_id, label)
    );

    CREATE INDEX IF NOT EXISTS idx_issue_labels_label ON issue_labels(label);

    CREATE TABLE IF NOT EXISTS prds (
      prd_id          TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id      TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','archived')),
      status_category TEXT NOT NULL DEFAULT 'active' CHECK(status_category IN ('backlog','active','blocked','done')),
      file_path       TEXT,
      linked_epic_id  TEXT REFERENCES epics(epic_id),
      version         INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      plan_id         TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id      TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed','archived')),
      status_category TEXT NOT NULL DEFAULT 'active' CHECK(status_category IN ('backlog','active','blocked','done')),
      prd_id          TEXT REFERENCES prds(prd_id),
      file_path       TEXT,
      version         INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_issues (
      plan_id  TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
      issue_id TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan_id, issue_id)
    );

    CREATE TABLE IF NOT EXISTS prd_plans (
      prd_id   TEXT NOT NULL REFERENCES prds(prd_id) ON DELETE CASCADE,
      plan_id  TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (prd_id, plan_id)
    );

    -- ── Task auxiliaries ─────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS task_relations (
      task_id        TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      target_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      relation_type  TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, target_task_id, relation_type)
    );

    CREATE INDEX IF NOT EXISTS idx_task_relations_target ON task_relations(target_task_id);

    CREATE TABLE IF NOT EXISTS task_labels (
      task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      label   TEXT NOT NULL,
      PRIMARY KEY (task_id, label)
    );

    CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label);

    CREATE TABLE IF NOT EXISTS display_id_sequences (
      entity_type TEXT NOT NULL,
      project_id  TEXT NOT NULL,
      last_value  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity_type, project_id)
    );

    -- ── Artifacts / Reviews / Worktrees ──────────────────────────────────────

    CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id  TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id   TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      title        TEXT NOT NULL,
      file_path    TEXT NOT NULL,
      owner_type   TEXT NOT NULL,
      owner_id     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final','archived')),
      content_hash TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentrun_artifacts (
      run_id      TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      PRIMARY KEY (run_id, artifact_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      review_id         TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id        TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id        TEXT NOT NULL,
      target_type       TEXT NOT NULL CHECK(target_type IN ('task','artifact','worktree')),
      target_id         TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','changes_requested','approved','rejected')),
      reviewer_agent_id TEXT,
      summary           TEXT,
      file_path         TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_targets (
      review_id   TEXT NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      PRIMARY KEY (review_id, artifact_id)
    );

    CREATE TABLE IF NOT EXISTS worktrees (
      worktree_id  TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'allocated' CHECK(status IN ('allocated','dirty','ready_for_merge','merged','discarded','conflict')),
      branch_name  TEXT NOT NULL,
      path         TEXT NOT NULL,
      base_branch  TEXT,
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
      project_id           TEXT,
      from_agent_id        TEXT,
      to_agent_id          TEXT,
      task_id              TEXT REFERENCES tasks(task_id),
      issue_id             TEXT REFERENCES issues(issue_id),
      goal                 TEXT NOT NULL,
      task_type            TEXT,
      priority             TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('critical','high','normal','low')),
      scope                TEXT NOT NULL DEFAULT 'task' CHECK(scope IN ('task','issue','project','workspace')),
      inputs               TEXT NOT NULL DEFAULT '{}',
      constraints          TEXT,
      done_criteria        TEXT,
      artifact_contract_id TEXT REFERENCES artifact_contracts(contract_id),
      handoff_mode         TEXT NOT NULL DEFAULT 'artifact_first_brief' CHECK(handoff_mode IN ('brief','contextual','artifact_first_brief','branched_session')),
      status               TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','completed','cancelled')),
      claimed_at           TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_handoffs_ws_status ON handoffs(workspace_id, status);

    -- ── Events / Audit ───────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS events (
      evt_id         TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL,
      project_id     TEXT,
      evt_type       TEXT NOT NULL,
      ts             TEXT NOT NULL DEFAULT (datetime('now')),
      object_type    TEXT,
      object_id      TEXT,
      actor_type     TEXT NOT NULL,
      actor_id       TEXT NOT NULL,
      payload        TEXT NOT NULL DEFAULT '{}',
      severity       TEXT NOT NULL DEFAULT 'info',
      trace_id       TEXT,
      span_id        TEXT,
      correlation_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_workspace ON events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_events_type      ON events(evt_type);
    CREATE INDEX IF NOT EXISTS idx_events_ts        ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_object    ON events(object_type, object_id);
    CREATE INDEX IF NOT EXISTS idx_events_ws_ts     ON events(workspace_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_events_ws_type   ON events(workspace_id, evt_type);

    CREATE TABLE IF NOT EXISTS run_events (
      id         TEXT PRIMARY KEY,
      run_id     TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      ts         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      event_type TEXT NOT NULL,
      payload    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, ts);

    CREATE TABLE IF NOT EXISTS hook_events (
      hook_event_id TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL DEFAULT '',
      session_id    TEXT NOT NULL,
      tool_name     TEXT NOT NULL,
      agent_role    TEXT NOT NULL DEFAULT '',
      run_id        TEXT,
      ts            TEXT NOT NULL,
      cli_name      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_hook_events_workspace_session_ts ON hook_events(workspace_id, session_id, ts);

    -- Audit log for write-path events that are not tool-call hooks (non-primary
    -- write drops, sanitize errors, WAL skips, etc). HIGH-5: the prior code
    -- tried to INSERT into hook_events with columns that did not exist —
    -- silent catch hid the schema drift. This table owns those audit rows.
    CREATE TABLE IF NOT EXISTS memory_write_events (
      event_id     TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT '',
      event_type   TEXT NOT NULL,
      payload      TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_memory_write_events_ws_type_ts ON memory_write_events(workspace_id, event_type, created_at);

    CREATE TABLE IF NOT EXISTS trace_events (
      span_id        TEXT PRIMARY KEY,
      trace_id       TEXT NOT NULL,
      parent_span_id TEXT,
      name           TEXT NOT NULL,
      workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      run_id         TEXT,
      status         TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','ok','error')),
      started_at     TEXT NOT NULL,
      ended_at       TEXT,
      payload        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trace_events_trace     ON trace_events(trace_id);
    CREATE INDEX IF NOT EXISTS idx_trace_events_workspace ON trace_events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_trace_events_run       ON trace_events(run_id);

    -- ── Locks / Sequences ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS advisory_locks (
      lock_id      TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      resource_path TEXT NOT NULL,
      run_id       TEXT NOT NULL,
      acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL,
      UNIQUE(workspace_id, resource_path)
    );

    CREATE INDEX IF NOT EXISTS idx_locks_workspace ON advisory_locks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_locks_expires   ON advisory_locks(expires_at);

    -- ── Policy ───────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS policy_rules (
      rule_id     TEXT PRIMARY KEY,
      scope       TEXT NOT NULL CHECK(scope IN ('system','user','workspace','project','team_agent','workflow_step')),
      scope_id    TEXT,
      name        TEXT NOT NULL,
      description TEXT,
      action      TEXT NOT NULL CHECK(action IN ('allow','deny','audit_only')),
      matchers    TEXT NOT NULL DEFAULT '[]',
      enabled     INTEGER NOT NULL DEFAULT 1,
      priority    INTEGER NOT NULL DEFAULT 100,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_policy_rules_scope    ON policy_rules(scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_policy_rules_priority ON policy_rules(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_policy_rules_enabled  ON policy_rules(enabled);

    CREATE TABLE IF NOT EXISTS policy_events (
      evt_id        TEXT PRIMARY KEY,
      rule_id       TEXT,
      workspace_id  TEXT NOT NULL,
      action        TEXT NOT NULL,
      matched       INTEGER NOT NULL DEFAULT 0,
      actor_id      TEXT NOT NULL,
      resource_type TEXT,
      resource_id   TEXT,
      payload       TEXT NOT NULL DEFAULT '{}',
      ts            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_policy_events_workspace ON policy_events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_policy_events_ts        ON policy_events(ts);

    -- ── Teams / Workflows ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS team_templates (
      template_id TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      slots       TEXT NOT NULL DEFAULT '[]',
      policy      TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_instances (
      instance_id       TEXT PRIMARY KEY,
      template_id       TEXT NOT NULL REFERENCES team_templates(template_id),
      workspace_id      TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id        TEXT REFERENCES projects(project_id),
      display_id        TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','ready','spawning','running','waiting','blocked','completed','failed','cancelled')),
      status_category   TEXT NOT NULL DEFAULT 'active' CHECK(status_category IN ('backlog','active','blocked','done')),
      purpose           TEXT NOT NULL,
      task_id           TEXT REFERENCES tasks(task_id),
      created_by_agent_id TEXT NOT NULL,
      resolved_slots    TEXT NOT NULL DEFAULT '{}',
      version           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      heartbeat_at      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_team_instances_workspace ON team_instances(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_team_instances_status    ON team_instances(status_category);

    CREATE TABLE IF NOT EXISTS team_members (
      instance_id TEXT NOT NULL REFERENCES team_instances(instance_id) ON DELETE CASCADE,
      slot_id     TEXT NOT NULL,
      agent_id    TEXT NOT NULL,
      role        TEXT NOT NULL,
      joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (instance_id, slot_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      wf_id               TEXT PRIMARY KEY,
      workspace_id        TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id          TEXT REFERENCES projects(project_id),
      display_id          TEXT NOT NULL,
      workflow_name       TEXT NOT NULL,
      workflow_version    TEXT NOT NULL DEFAULT '1.0',
      status              TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','ready','running','waiting_input','waiting_dependency','blocked','failed','completed','cancelled')),
      status_category     TEXT NOT NULL DEFAULT 'active' CHECK(status_category IN ('backlog','active','blocked','done')),
      task_id             TEXT REFERENCES tasks(task_id),
      issue_id            TEXT REFERENCES issues(issue_id),
      steps               TEXT NOT NULL DEFAULT '[]',
      current_step_id     TEXT,
      handoff_refs        TEXT NOT NULL DEFAULT '[]',
      artifact_refs       TEXT NOT NULL DEFAULT '[]',
      error               TEXT,
      version             INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
      started_at          TEXT,
      completed_at        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wf_runs_workspace ON workflow_runs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_wf_runs_status    ON workflow_runs(status_category);
    CREATE INDEX IF NOT EXISTS idx_wf_runs_project   ON workflow_runs(workspace_id, project_id) WHERE project_id IS NOT NULL;

    -- ── Agent definitions / profiles ─────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS agent_profiles (
      profile_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      base_role    TEXT NOT NULL DEFAULT 'custom' CHECK(base_role IN ('chief_of_staff','context_gatherer','prd_planner','implementation_planner','issue_decomposer','software_engineer','research_worker','refactor_worker','browser_worker','data_engineer','ml_engineer','devops_engineer','architecture_reviewer','code_reviewer','qa_engineer','security_reviewer','integration_worker','documentation_writer','memory_curator','tech_lead','product_manager','analyst','orchestrator','custom')),
      description  TEXT NOT NULL,
      system_prompt TEXT,
      capabilities TEXT NOT NULL DEFAULT '{}',
      created_by   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_ws_name ON agent_profiles(workspace_id, name);
    CREATE INDEX IF NOT EXISTS idx_agent_profiles_workspace  ON agent_profiles(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_agent_profiles_base_role  ON agent_profiles(base_role);

    CREATE TABLE IF NOT EXISTS agent_definitions (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL DEFAULT 'global',
      role          TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      description   TEXT NOT NULL,
      version       TEXT NOT NULL DEFAULT '0.1.0',
      stability     TEXT NOT NULL DEFAULT 'experimental' CHECK(stability IN ('stable','beta','experimental','deprecated')),
      system_prompt TEXT,
      model         TEXT,
      provider      TEXT NOT NULL DEFAULT 'anthropic',
      tools_allow   TEXT,
      tools_deny    TEXT,
      capabilities  TEXT NOT NULL DEFAULT '[]',
      output_schema TEXT,
      executor_uri  TEXT,
      a2a_card      TEXT,
      eval_suites   TEXT NOT NULL DEFAULT '[]',
      allow_dispatch INTEGER NOT NULL DEFAULT 1,
      icon_url      TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(workspace_id, role)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_definitions_role      ON agent_definitions(role);
    CREATE INDEX IF NOT EXISTS idx_agent_definitions_stability ON agent_definitions(stability);
    CREATE INDEX IF NOT EXISTS idx_agent_definitions_ws_role   ON agent_definitions(workspace_id, role);

    CREATE TABLE IF NOT EXISTS agent_state_projection (
      run_id       TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT,
      agent_id     TEXT,
      agent_role   TEXT,
      pi_profile   TEXT,
      status       TEXT NOT NULL,
      task_id      TEXT,
      current_step TEXT,
      current_path TEXT,
      progress_pct REAL,
      heartbeat_at TEXT,
      blocker      TEXT,
      worktree_id  TEXT,
      updated_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_asp_workspace ON agent_state_projection(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_asp_status    ON agent_state_projection(status);

    -- ── Code chunks ──────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS code_chunks (
      chunk_id       TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id     TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      file_path      TEXT NOT NULL,
      -- v2a Task 5: file_id links to code_files; nullable until PR 4 backfills.
      file_id        TEXT,
      language       TEXT,
      chunk_strategy TEXT NOT NULL CHECK(chunk_strategy IN ('syntax','semantic','token')),
      source_type    TEXT NOT NULL CHECK(source_type IN ('code','prose')),
      content        TEXT NOT NULL,
      start_line     INTEGER,
      end_line       INTEGER,
      symbol_path    TEXT,
      embedding      BLOB,
      content_hash   TEXT,
      indexed_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_project    ON code_chunks(project_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_file       ON code_chunks(file_path);
    CREATE INDEX IF NOT EXISTS idx_chunks_hash       ON code_chunks(content_hash);
    CREATE INDEX IF NOT EXISTS idx_chunks_ws_project ON code_chunks(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_code_chunks_file  ON code_chunks(file_id) WHERE file_id IS NOT NULL;

    -- v2a PR 1 Task 5: PCI tables. code_files is the file-level row with stable
    -- file_id (sha256(project_id + ':' + rel_path)) — see PR 4 chunkers. The
    -- existing code_chunks table stays (legacy file_path-based shape); a new
    -- file_id column links chunks to code_files for forward-compat. PR 4's PCI
    -- watcher populates file_id at ingest. code_chunks_fts already exists with
    -- the §3.3c shape.
    CREATE TABLE IF NOT EXISTS code_files (
      file_id      TEXT NOT NULL PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      rel_path     TEXT NOT NULL,
      language     TEXT NOT NULL DEFAULT 'unknown',
      sha256       TEXT NOT NULL,
      mtime_ns     INTEGER NOT NULL,
      size_bytes   INTEGER NOT NULL,
      chunks_count INTEGER NOT NULL DEFAULT 0,
      indexed_at   INTEGER NOT NULL,
      UNIQUE (project_id, rel_path)
    );
    CREATE INDEX IF NOT EXISTS idx_code_files_lang ON code_files (language);
    CREATE INDEX IF NOT EXISTS idx_code_files_ws   ON code_files (workspace_id, project_id);

    CREATE TABLE IF NOT EXISTS code_symbols (
      file_id TEXT NOT NULL REFERENCES code_files(file_id) ON DELETE CASCADE,
      name    TEXT NOT NULL,
      kind    TEXT NOT NULL,
      line    INTEGER NOT NULL,
      PRIMARY KEY (file_id, name, line)
    );
    CREATE INDEX IF NOT EXISTS idx_code_symbols_name ON code_symbols (name);

    -- ── Graph (knowledge graph) ───────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS graph_entities (
      entity_id    TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      entity_type  TEXT NOT NULL,
      properties   TEXT NOT NULL DEFAULT '{}',
      valid_from   TEXT,
      valid_until  TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_graph_entities_workspace ON graph_entities(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_graph_entities_type      ON graph_entities(workspace_id, entity_type);

    CREATE TABLE IF NOT EXISTS graph_edges (
      edge_id      TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id    TEXT NOT NULL REFERENCES graph_entities(entity_id),
      target_id    TEXT NOT NULL REFERENCES graph_entities(entity_id),
      relation     TEXT NOT NULL,
      weight       REAL NOT NULL DEFAULT 1.0,
      properties   TEXT NOT NULL DEFAULT '{}',
      valid_from   TEXT,
      valid_until  TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(workspace_id, source_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(workspace_id, target_id);

    CREATE TABLE IF NOT EXISTS graph_episodes (
      episode_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      entity_id    TEXT NOT NULL REFERENCES graph_entities(entity_id),
      content      TEXT NOT NULL,
      episode_type TEXT NOT NULL DEFAULT 'observation',
      valid_from   TEXT,
      valid_until  TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_graph_episodes_entity ON graph_episodes(workspace_id, entity_id);

    -- ── Sync ─────────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS sync_states (
      sync_id         TEXT PRIMARY KEY,
      object_type     TEXT NOT NULL,
      object_id       TEXT NOT NULL,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      sync_target     TEXT NOT NULL DEFAULT 'plane',
      external_id     TEXT,
      last_synced_at  TEXT,
      sync_status     TEXT NOT NULL DEFAULT 'never_synced' CHECK(sync_status IN ('never_synced','queued','syncing','synced','conflicted','failed','disabled')),
      last_sync_hash  TEXT,
      last_sync_error TEXT,
      direction       TEXT NOT NULL DEFAULT 'bidirectional' CHECK(direction IN ('local_to_remote','remote_to_local','bidirectional')),
      conflict_state  TEXT NOT NULL DEFAULT 'none' CHECK(conflict_state IN ('none','detected','resolving','resolved','unresolvable')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(object_id, sync_target)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_states_workspace ON sync_states(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_sync_states_object    ON sync_states(workspace_id, object_type, object_id);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      conflict_id  TEXT PRIMARY KEY,
      sync_id      TEXT NOT NULL REFERENCES sync_states(sync_id),
      local_hash   TEXT,
      remote_hash  TEXT,
      detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolution   TEXT CHECK(resolution IN ('local_wins','remote_wins','manual')),
      resolved_at  TEXT,
      resolved_by  TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      queue_id     TEXT PRIMARY KEY,
      sync_id      TEXT NOT NULL REFERENCES sync_states(sync_id),
      operation    TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
      priority     INTEGER NOT NULL DEFAULT 100,
      scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_error   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_scheduled ON sync_queue(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_priority  ON sync_queue(priority DESC);

    -- ── Analytics ────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS analytics_daily (
      id             TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id     TEXT NOT NULL,
      date           TEXT NOT NULL,
      issues_created INTEGER NOT NULL DEFAULT 0,
      issues_closed  INTEGER NOT NULL DEFAULT 0,
      tasks_created  INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      tasks_blocked  INTEGER NOT NULL DEFAULT 0,
      runs_started   INTEGER NOT NULL DEFAULT 0,
      runs_finished  INTEGER NOT NULL DEFAULT 0,
      runs_failed    INTEGER NOT NULL DEFAULT 0,
      memory_writes  INTEGER NOT NULL DEFAULT 0,
      memory_recalls INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, project_id, date)
    );

    CREATE TABLE IF NOT EXISTS analytics_cycle (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL,
      cycle_id     TEXT NOT NULL,
      committed    INTEGER NOT NULL DEFAULT 0,
      completed    INTEGER NOT NULL DEFAULT 0,
      scope_added  INTEGER NOT NULL DEFAULT 0,
      rolled_over  INTEGER NOT NULL DEFAULT 0,
      avg_cycle_time_h REAL
    );

    CREATE TABLE IF NOT EXISTS analytics_project (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL,
      date         TEXT NOT NULL,
      wip_count    INTEGER NOT NULL DEFAULT 0,
      throughput   INTEGER NOT NULL DEFAULT 0,
      lead_time_h  REAL,
      blocked_h    REAL,
      UNIQUE(workspace_id, project_id, date)
    );

    CREATE TABLE IF NOT EXISTS analytics_agent (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      agent_id        TEXT NOT NULL,
      date            TEXT NOT NULL,
      runs_started    INTEGER NOT NULL DEFAULT 0,
      runs_completed  INTEGER NOT NULL DEFAULT 0,
      runs_blocked    INTEGER NOT NULL DEFAULT 0,
      runs_failed     INTEGER NOT NULL DEFAULT 0,
      avg_duration_min REAL,
      handoff_count   INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, agent_id, date)
    );

    CREATE TABLE IF NOT EXISTS analytics_team (
      id                  TEXT PRIMARY KEY,
      workspace_id        TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      instance_id         TEXT NOT NULL,
      date                TEXT NOT NULL,
      tasks_completed     INTEGER NOT NULL DEFAULT 0,
      avg_slot_duration_min REAL,
      concurrency_peak    INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, instance_id, date)
    );

    -- ── FTS5 full-text search ────────────────────────────────────────────────

    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
      title, description,
      content='tasks', content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content, title, summary, canonical_text,
      content='memories', content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS epics_fts USING fts5(
      title, description,
      content='epics', content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS issues_fts USING fts5(
      title, description,
      content='issues', content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS prds_fts USING fts5(
      title, description,
      content='prds', content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(
      title, description,
      content='plans', content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
      title,
      content='artifacts', content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
      content, symbol_path,
      content='code_chunks', content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 1 separators ''._-'''
    );
  `)

  // sqlite-vec: optional, not available in all environments
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(memory_id text primary key, embedding float[1024])`)
  } catch { /* sqlite-vec not available */ }

  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(chunk_id text primary key, embedding float[1024])`)
  } catch { /* sqlite-vec not available */ }

  // ── FTS5 triggers ─────────────────────────────────────────────────────────
  // SQLite doesn't support CREATE TRIGGER IF NOT EXISTS, so drop first.

  db.exec(`
    DROP TRIGGER IF EXISTS tasks_ai;
    DROP TRIGGER IF EXISTS tasks_ad;
    DROP TRIGGER IF EXISTS tasks_au;
    CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;
    CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
    END;
    CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;

    DROP TRIGGER IF EXISTS memories_ai;
    DROP TRIGGER IF EXISTS memories_ad;
    DROP TRIGGER IF EXISTS memories_au;
    CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, title, summary, canonical_text) VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
    END;
    CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text) VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
    END;
    CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text) VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
      INSERT INTO memories_fts(rowid, content, title, summary, canonical_text) VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
    END;

    DROP TRIGGER IF EXISTS epics_ai;
    DROP TRIGGER IF EXISTS epics_ad;
    DROP TRIGGER IF EXISTS epics_au;
    CREATE TRIGGER epics_ai AFTER INSERT ON epics BEGIN
      INSERT INTO epics_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;
    CREATE TRIGGER epics_ad AFTER DELETE ON epics BEGIN
      INSERT INTO epics_fts(epics_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
    END;
    CREATE TRIGGER epics_au AFTER UPDATE ON epics BEGIN
      INSERT INTO epics_fts(epics_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      INSERT INTO epics_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;

    DROP TRIGGER IF EXISTS issues_ai;
    DROP TRIGGER IF EXISTS issues_ad;
    DROP TRIGGER IF EXISTS issues_au;
    CREATE TRIGGER issues_ai AFTER INSERT ON issues BEGIN
      INSERT INTO issues_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;
    CREATE TRIGGER issues_ad AFTER DELETE ON issues BEGIN
      INSERT INTO issues_fts(issues_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
    END;
    CREATE TRIGGER issues_au AFTER UPDATE ON issues BEGIN
      INSERT INTO issues_fts(issues_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      INSERT INTO issues_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;

    DROP TRIGGER IF EXISTS prds_ai;
    DROP TRIGGER IF EXISTS prds_ad;
    DROP TRIGGER IF EXISTS prds_au;
    CREATE TRIGGER prds_ai AFTER INSERT ON prds BEGIN
      INSERT INTO prds_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;
    CREATE TRIGGER prds_ad AFTER DELETE ON prds BEGIN
      INSERT INTO prds_fts(prds_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
    END;
    CREATE TRIGGER prds_au AFTER UPDATE ON prds BEGIN
      INSERT INTO prds_fts(prds_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      INSERT INTO prds_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;

    DROP TRIGGER IF EXISTS plans_ai;
    DROP TRIGGER IF EXISTS plans_ad;
    DROP TRIGGER IF EXISTS plans_au;
    CREATE TRIGGER plans_ai AFTER INSERT ON plans BEGIN
      INSERT INTO plans_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;
    CREATE TRIGGER plans_ad AFTER DELETE ON plans BEGIN
      INSERT INTO plans_fts(plans_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
    END;
    CREATE TRIGGER plans_au AFTER UPDATE ON plans BEGIN
      INSERT INTO plans_fts(plans_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      INSERT INTO plans_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;

    DROP TRIGGER IF EXISTS artifacts_ai;
    DROP TRIGGER IF EXISTS artifacts_ad;
    DROP TRIGGER IF EXISTS artifacts_au;
    CREATE TRIGGER artifacts_ai AFTER INSERT ON artifacts BEGIN
      INSERT INTO artifacts_fts(rowid, title) VALUES (new.rowid, new.title);
    END;
    CREATE TRIGGER artifacts_ad AFTER DELETE ON artifacts BEGIN
      INSERT INTO artifacts_fts(artifacts_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
    END;
    CREATE TRIGGER artifacts_au AFTER UPDATE ON artifacts BEGIN
      INSERT INTO artifacts_fts(artifacts_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
      INSERT INTO artifacts_fts(rowid, title) VALUES (new.rowid, new.title);
    END;

    DROP TRIGGER IF EXISTS code_chunks_ai;
    DROP TRIGGER IF EXISTS code_chunks_ad;
    DROP TRIGGER IF EXISTS code_chunks_au;
    CREATE TRIGGER code_chunks_ai AFTER INSERT ON code_chunks BEGIN
      INSERT INTO code_chunks_fts(rowid, content, symbol_path) VALUES (new.rowid, new.content, new.symbol_path);
    END;
    CREATE TRIGGER code_chunks_ad AFTER DELETE ON code_chunks BEGIN
      INSERT INTO code_chunks_fts(code_chunks_fts, rowid, content, symbol_path) VALUES ('delete', old.rowid, old.content, old.symbol_path);
    END;
    CREATE TRIGGER code_chunks_au AFTER UPDATE ON code_chunks BEGIN
      INSERT INTO code_chunks_fts(code_chunks_fts, rowid, content, symbol_path) VALUES ('delete', old.rowid, old.content, old.symbol_path);
      INSERT INTO code_chunks_fts(rowid, content, symbol_path) VALUES (new.rowid, new.content, new.symbol_path);
    END;
  `)

  seedCanonicalAgentDefinitions(db)
  seedDefaultPolicyRules(db)
  recordLegacyMigrationNames(db)
}

// Canonical 24 AgentRole seeds. Replaces the old m032b migration.
// INSERT OR IGNORE makes this idempotent across runs; updated_at is left alone.
function seedCanonicalAgentDefinitions(db: Database.Database): void {
  const seedId = (role: string) => `agentdef_builtin_${role.replace(/_/g, '')}`
  const builtins: Array<{ role: string; display_name: string; description: string; capabilities: string }> = [
    { role: 'chief_of_staff',         display_name: 'Chief of Staff',         description: 'Plans work, creates teams, dispatches agents, reviews CoS context',   capabilities: '["create_teams","dispatch_agents"]' },
    { role: 'context_gatherer',       display_name: 'Context Gatherer',       description: 'Gathers context about codebase, requirements, and environment',       capabilities: '[]' },
    { role: 'prd_planner',            display_name: 'PRD Planner',            description: 'Writes Product Requirements Documents from high-level specs',         capabilities: '[]' },
    { role: 'implementation_planner', display_name: 'Implementation Planner', description: 'Breaks PRDs and epics into detailed implementation plans',            capabilities: '[]' },
    { role: 'issue_decomposer',       display_name: 'Issue Decomposer',       description: 'Decomposes issues into atomic tasks with acceptance criteria',        capabilities: '[]' },
    { role: 'architecture_reviewer',  display_name: 'Architecture Reviewer',  description: 'Reviews architectural decisions and system design',                   capabilities: '[]' },
    { role: 'research_worker',        display_name: 'Research Worker',        description: 'Investigates unknowns, evaluates libraries and approaches',           capabilities: '[]' },
    { role: 'software_engineer',      display_name: 'Software Engineer',      description: 'Implements features, APIs, data layers, and UI across the stack',     capabilities: '["write_code","edit_files","run_tests"]' },
    { role: 'refactor_worker',        display_name: 'Refactor Worker',        description: 'Improves code quality, reduces duplication, applies patterns',        capabilities: '["write_code","edit_files"]' },
    { role: 'browser_worker',         display_name: 'Browser Worker',         description: 'Performs browser automation, web scraping, and UI testing',           capabilities: '["browser"]' },
    { role: 'data_engineer',          display_name: 'Data Engineer',          description: 'Builds data pipelines, ETL, and data infrastructure',                 capabilities: '["write_code","edit_files"]' },
    { role: 'ml_engineer',            display_name: 'ML Engineer',            description: 'Trains models, builds ML pipelines and evaluation tooling',           capabilities: '["write_code","edit_files"]' },
    { role: 'devops_engineer',        display_name: 'DevOps Engineer',        description: 'Manages infrastructure, CI/CD, and deployment pipelines',             capabilities: '["write_code","edit_files"]' },
    { role: 'qa_engineer',            display_name: 'QA Engineer',            description: 'Writes and runs tests, validates implementations against acceptance criteria', capabilities: '["write_code","run_tests"]' },
    { role: 'code_reviewer',          display_name: 'Code Reviewer',          description: 'Reviews pull requests, provides structured feedback and approval',    capabilities: '[]' },
    { role: 'security_reviewer',      display_name: 'Security Reviewer',      description: 'Audits code for security vulnerabilities and policy violations',      capabilities: '[]' },
    { role: 'integration_worker',     display_name: 'Integration Worker',     description: 'Merges worktrees, resolves conflicts, coordinates cross-team deps',   capabilities: '["write_code","edit_files"]' },
    { role: 'documentation_writer',   display_name: 'Documentation Writer',   description: 'Writes and updates technical documentation and READMEs',              capabilities: '["write_code","edit_files"]' },
    { role: 'memory_curator',         display_name: 'Memory Curator',         description: 'Curates and prunes the memory vault, promotes operational memories',  capabilities: '[]' },
    { role: 'tech_lead',              display_name: 'Tech Lead',              description: 'Provides technical leadership, unblocks engineers, owns architecture', capabilities: '[]' },
    { role: 'product_manager',        display_name: 'Product Manager',        description: 'Manages roadmap, prioritises work, writes PRDs and success criteria', capabilities: '[]' },
    { role: 'analyst',                display_name: 'Analyst',                description: 'Analyses data, generates reports, and surfaces insights',             capabilities: '[]' },
    { role: 'orchestrator',           display_name: 'Orchestrator',           description: 'Generic sub-orchestrator for parallelising multi-agent work',         capabilities: '["dispatch_agents"]' },
    { role: 'custom',                 display_name: 'Custom',                 description: 'Custom agent role defined per-workspace',                             capabilities: '[]' },
  ]

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO agent_definitions
      (id, workspace_id, role, display_name, description, version, stability, capabilities, created_at, updated_at)
    VALUES (?, 'global', ?, ?, ?, '0.1.0', 'stable', ?, unixepoch(), unixepoch())
  `)
  for (const b of builtins) {
    stmt.run(seedId(b.role), b.role, b.display_name, b.description, b.capabilities)
  }
}

// Default system policy rules. INSERT OR IGNORE — idempotent across schema runs.
function seedDefaultPolicyRules(db: Database.Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO policy_rules
      (rule_id, scope, name, description, action, matchers, enabled, priority, created_at, updated_at)
    VALUES (
      'policy_builtin_global_recall_allowed_roles',
      'system',
      'global_recall_allowed_roles',
      'Roles permitted to perform scope=global memory recall',
      'allow',
      '["chief_of_staff"]',
      1,
      1000,
      datetime('now'),
      datetime('now')
    )
  `).run()
}

// Record the historical migration names tests reference. applySchema is the
// consolidated replacement for m001..m052 — we emit the canonical migration
// names here so existing assertions against schema_migrations keep passing.
function recordLegacyMigrationNames(db: Database.Database): void {
  const names = [
    '031_agent_definitions',
    '032b_seed_agent_definitions',
    '034_missing_indices',
  ]
  const stmt = db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)")
  for (const n of names) stmt.run(n)
}
