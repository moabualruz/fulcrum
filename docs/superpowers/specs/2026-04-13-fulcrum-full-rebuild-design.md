# Fulcrum Full Rebuild — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild `@fulcrum/core` to spec completeness and add 8 new packages covering the full original feature set — planning hierarchy, policy engine, enriched memory, teams, workflow engine, worktrees, monitor/analytics, and Plane sync.

**Architecture:** Option A monorepo — domain-sliced packages, one SQLite file shared across all packages, plain async functions at every public API boundary, adapters only at external integration points (Plane REST API, SSE transport), strategies for decision logic (memory ranking, model routing), facades for orchestration (workflow coordination, team scheduling).

**Tech Stack:** TypeScript, better-sqlite3, pnpm workspaces, vitest, ulid, Hono (SSE/monitor server), @huggingface/transformers (embeddings + reranker)

**Code standards:** Locality of behavior first. Replaceable boundaries at external integrations. Stable domain vocabulary. Simple concrete code inside features. Adapters/Strategy/Facade/Policy patterns at the right places. Events only at subsystem boundaries — not emitted for every DB write. State-first modeling.

---

## Package Map

```
packages/
  core/          EXISTS — extended: full domain types, all migrations, emitEvent()
  planning/      NEW — Epic, Issue, PRD, Plan CRUD + state machines
  policy/        NEW — deny rules, SecretGuard, audit log, 6-level scopes
  memory/        NEW — 13 kinds, 3 scopes, 4 recall modes, ingestion pipeline
  teams/         NEW — TeamTemplate, TeamInstance, 16 roles, slot routing
  workflows/     NEW — DAG engine, 17 step types, 4 built-in workflows
  worktrees/     NEW — git worktree allocator, merge queue
  monitor/       NEW — metrics, analytics, SSE server
  sync/          NEW — Plane adapter, sync queue, conflict resolution
```

### Dependency rules (no cycles)

```
core        → nothing in workspace
planning    → core
policy      → core
memory      → core
teams       → core, planning, policy
workflows   → core, planning, teams, memory
worktrees   → core, teams
monitor     → core, planning, teams, workflows
sync        → core, planning, policy
```

---

## Domain Model

### ID Strategy
All IDs are ULIDs with typed prefixes stored as strings:
`ws_`, `proj_`, `epic_`, `iss_`, `task_`, `prd_`, `plan_`, `run_`, `wf_`, `wt_`, `rev_`, `art_`, `mem_`, `hof_`, `ac_`, `evt_`, `team_`, `pol_`, `cycle_`, `mile_`

Display IDs use a `display_id_sequences` table with `BEGIN IMMEDIATE` transactions:
`EPIC-1`, `ISS-143`, `TASK-882`, `RUN-5`, `WF-3`, `ART-99`

### Status Enums

```typescript
type WorkspaceStatus   = 'active' | 'archived'
type ProjectStatus     = 'active' | 'archived' | 'paused'
type EpicStatus        = 'backlog' | 'in_progress' | 'done' | 'cancelled'
type IssueStatus       = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'cancelled'
type TaskStatus        = 'queued' | 'ready' | 'claimed' | 'running' | 'blocked' | 'failed' | 'completed' | 'cancelled'
type AgentRunStatus    = 'created' | 'starting' | 'running' | 'waiting' | 'blocked' | 'failed' | 'finished' | 'aborted'
type WorkflowRunStatus = 'created' | 'ready' | 'running' | 'waiting_input' | 'waiting_dependency' | 'blocked' | 'failed' | 'completed' | 'cancelled'
type WorkflowStepStatus= 'pending' | 'ready' | 'running' | 'retrying' | 'waiting_input' | 'waiting_dependency' | 'blocked' | 'failed' | 'completed' | 'skipped'
type ReviewStatus      = 'pending' | 'changes_requested' | 'approved' | 'rejected'
type WorktreeStatus    = 'allocated' | 'dirty' | 'ready_for_merge' | 'merged' | 'discarded'
type TeamInstanceStatus= 'created' | 'ready' | 'spawning' | 'running' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'cancelled'
type SyncStatus        = 'never_synced' | 'queued' | 'syncing' | 'synced' | 'conflicted' | 'failed' | 'disabled'
type ArtifactStatus    = 'draft' | 'final' | 'archived'
type PRDStatus         = 'draft' | 'review' | 'approved' | 'archived'
type PlanStatus        = 'draft' | 'active' | 'completed' | 'archived'
```

### Status Category
Every entity with a status also carries `status_category: 'backlog' | 'active' | 'blocked' | 'done'`.
Set by application code on every status write (never by triggers). Enables fast cross-entity queries.

Mapping:
- `backlog` → queued, ready, backlog, draft, never_synced
- `active` → claimed, running, starting, waiting, in_progress, in_review, syncing
- `blocked` → blocked, waiting_input, waiting_dependency, conflicted
- `done` → completed, done, finished, cancelled, failed, aborted, archived, approved, merged, discarded

### Entity Relationships

```
Workspace
  └─ Project (project_type: git|non_git|submodule|logical, write_mode: sequential|worktree)
       └─ Epic → Issue → SubIssue (self-ref) → Task → AgentRun
       └─ PRD → Plan → Issues (via plan_issues)
       └─ WorkflowRun
       └─ TeamInstance
       └─ Artifact / Review / Worktree

Memory (global|project|file scope, 13 kinds)
TeamTemplate (reusable blueprint)
PolicyRule (6 scope levels)
SyncState (per object, per sync target)
Event (30 types, append-only)
HandoffPacket / ArtifactContract
```

### AgentRole Enum (16 roles)
```typescript
type AgentRole =
  | 'chief_of_staff'        // L1 — only role that can invoke teams
  | 'context_gatherer'
  | 'prd_planner'
  | 'implementation_planner'
  | 'issue_decomposer'
  | 'architecture_reviewer'
  | 'research_worker'
  | 'implementer_backend'
  | 'implementer_frontend'
  | 'implementer'           // generic
  | 'refactor_worker'
  | 'browser_worker'
  | 'tester'
  | 'reviewer'
  | 'security_reviewer'
  | 'performance_reviewer'
  | 'integration_worker'    // only role that owns merge
  | 'planner'               // generic
  | 'researcher'            // generic
```

### Memory Model
```typescript
type MemoryScope = 'global' | 'project' | 'file'
type MemoryKind  =
  | 'fact' | 'summary' | 'symbol' | 'decision' | 'procedure'
  | 'error' | 'diff' | 'doc' | 'code'
  | 'task_goal' | 'task_decision' | 'task_failure' | 'task_outcome'

interface Memory {
  memory_id: string          // mem_ prefix
  scope: MemoryScope
  kind: MemoryKind
  workspace_id: string
  project_id: string | null  // null = global scope
  file_path: string | null   // file scope only
  symbol_path: string | null // dot-notation, e.g. MyClass.myMethod
  title: string
  summary: string
  canonical_text: string | null  // full content for path-based open
  tags: string[]
  entities: string[]             // extracted named entities
  confidence: number             // 0-1, how verified
  access_count: number
  event_time: string | null      // when fact occurred (not created_at)
  content_hash: string | null    // SHA256 for dedup
  task_id: string | null
  issue_id: string | null
  artifact_id: string | null
  provenance_refs: string[]      // what generated this memory
  embedding: Buffer | null       // for vector recall
  created_at: string
  updated_at: string
  last_accessed_at: string
}
```

Note: `importance` and `freshness` are NOT stored — computed dynamically at recall time from `access_count`, `confidence`, `updated_at`.

### Artifact Types (18)
```typescript
type ArtifactType =
  | 'prd' | 'plan' | 'issue_breakdown' | 'context_gathering_report'
  | 'patch' | 'changed_files_manifest' | 'command_log'
  | 'test_report' | 'benchmark_report' | 'review_report'
  | 'integration_report' | 'merge_conflict_report' | 'risk_report'
  | 'research_note' | 'source_digest' | 'comparison_matrix'
  | 'memory_promotion_summary' | 'task_outcome_summary'
```

### Task Relation Types
```typescript
type TaskRelationType =
  | 'blocks' | 'blocked_by'
  | 'follows' | 'preceded_by'
  | 'relates' | 'duplicates'
  | 'requires_context_from'
  | 'must_merge_before'
  | 'conflicts_with'
  | 'reviewed_by'
  | 'verifies'
```

Stored in `task_relations` adjacency list table. Transitive closure queries handled by app-level recursive CTE, not triggers.

### Event Types (30)
```typescript
type EventType =
  | 'project_registered' | 'epic_created' | 'issue_created' | 'task_created'
  | 'task_status_changed' | 'team_created' | 'team_invoked'
  | 'agent_run_created' | 'agent_run_started' | 'agent_run_progress'
  | 'agent_run_blocked' | 'agent_run_failed' | 'agent_run_finished'
  | 'handoff_created' | 'handoff_consumed'
  | 'artifact_written' | 'artifact_validated'
  | 'memory_written' | 'memory_recalled'
  | 'worktree_allocated' | 'merge_queued' | 'merge_started'
  | 'merge_conflicted' | 'merge_completed'
  | 'review_created' | 'validation_started' | 'validation_finished'
  | 'policy_denied' | 'hook_executed' | 'workflow_step_completed'
```

---

## SQL Schema

### MIGRATION_001 — existing core (keep, minor extensions)

Tables: `schema_migrations`, `advisory_locks`, `workspaces`, `projects`, `tasks`, `agent_runs`, `memories`, `tasks_fts`, `memories_fts`, `vec_memories`

Extensions needed in MIGRATION_002:
- `workspaces`: + `status`
- `projects`: + `project_type`, `root_path`, `default_branch`, `parent_project_id`, `write_mode`, `status`
- `tasks`: + `display_id`, `issue_id`, `priority`, `estimate_type`, `estimate_value`, `done_criteria`, `status_category`, `claimed_at`, `completed_at` — status enum → 8 values — remove `depends_on` JSON column
- `agent_runs`: + `display_id`, `project_id`, `agent_id`, `pi_profile`, `status_category`, `current_path`, `heartbeat_at`, `blocker`, `worktree_id`, `finished_at` — status enum → 8 values — rename `completed_at` → `finished_at`
- `memories`: + `scope`, `kind`, `title`, `summary`, `canonical_text`, `entities`, `event_time`, `content_hash`, `symbol_path`, `task_id`, `issue_id`, `artifact_id`, `provenance_refs` — remove `confidence` (already exists) — `memories_fts` gains title, summary, canonical_text columns

### MIGRATION_002 — foundation additions (core)

```sql
-- Display ID sequences
CREATE TABLE display_id_sequences (
  entity_type TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  last_value  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, project_id)
);

-- Events (append-only — enforced by app, never UPDATE or DELETE)
CREATE TABLE events (
  evt_id         TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES projects(project_id),
  evt_type       TEXT NOT NULL,
  ts             TEXT NOT NULL DEFAULT (datetime('now')),
  object_type    TEXT,
  object_id      TEXT,
  actor_type     TEXT NOT NULL,
  actor_id       TEXT NOT NULL,
  payload        TEXT NOT NULL DEFAULT '{}',
  severity       TEXT NOT NULL DEFAULT 'info'
    CHECK(severity IN ('debug','info','warn','error')),
  trace_id       TEXT,
  span_id        TEXT,
  correlation_id TEXT
);
CREATE INDEX idx_events_workspace ON events(workspace_id);
CREATE INDEX idx_events_type      ON events(evt_type);
CREATE INDEX idx_events_ts        ON events(ts);
CREATE INDEX idx_events_object    ON events(object_type, object_id);
```

### MIGRATION_003 — planning (@fulcrum/planning)

```sql
CREATE TABLE epics (
  epic_id         TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status IN ('backlog','in_progress','done','cancelled')),
  status_category TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  priority        TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('critical','high','medium','low','none')),
  milestone_id    TEXT,
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE issues (
  issue_id         TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  epic_id          TEXT REFERENCES epics(epic_id),
  parent_issue_id  TEXT REFERENCES issues(issue_id),
  display_id       TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status IN ('backlog','ready','in_progress','blocked','in_review','done','cancelled')),
  status_category  TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  priority         TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('critical','high','medium','low','none')),
  assignee_agent_id TEXT,
  estimate_type    TEXT CHECK(estimate_type IN ('story_points','hours')),
  estimate_value   REAL,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE issue_labels (
  issue_id   TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (issue_id, label)
);
CREATE INDEX idx_issue_labels_label ON issue_labels(label);

CREATE TABLE prds (
  prd_id          TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','review','approved','archived')),
  status_category TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  file_path       TEXT,
  linked_epic_id  TEXT REFERENCES epics(epic_id),
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE plans (
  plan_id         TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','active','completed','archived')),
  status_category TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  prd_id          TEXT REFERENCES prds(prd_id),
  file_path       TEXT,
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Junction tables
CREATE TABLE plan_issues (
  plan_id    TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  issue_id   TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (plan_id, issue_id)
);

CREATE TABLE prd_plans (
  prd_id   TEXT NOT NULL REFERENCES prds(prd_id) ON DELETE CASCADE,
  plan_id  TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (prd_id, plan_id)
);

-- Task relations (replaces depends_on JSON column)
CREATE TABLE task_relations (
  task_id        TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  target_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  relation_type  TEXT NOT NULL
    CHECK(relation_type IN (
      'blocks','blocked_by','follows','preceded_by','relates','duplicates',
      'requires_context_from','must_merge_before','conflicts_with',
      'reviewed_by','verifies'
    )),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, target_task_id, relation_type)
);
CREATE INDEX idx_task_relations_target ON task_relations(target_task_id);

-- Task labels (replaces labels JSON column)
CREATE TABLE task_labels (
  task_id  TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, label)
);
CREATE INDEX idx_task_labels_label ON task_labels(label);

-- FTS5 for planning entities
CREATE VIRTUAL TABLE IF NOT EXISTS issues_fts
  USING fts5(title, description, content='issues', content_rowid='rowid',
             tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS prds_fts
  USING fts5(title, description, content='prds', content_rowid='rowid',
             tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts
  USING fts5(title, description, content='plans', content_rowid='rowid',
             tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS epics_fts
  USING fts5(title, description, content='epics', content_rowid='rowid',
             tokenize='porter unicode61');

-- Indexes
CREATE INDEX idx_epics_workspace   ON epics(workspace_id);
CREATE INDEX idx_epics_project     ON epics(project_id);
CREATE INDEX idx_epics_status      ON epics(status_category);
CREATE INDEX idx_issues_workspace  ON issues(workspace_id);
CREATE INDEX idx_issues_project    ON issues(project_id);
CREATE INDEX idx_issues_epic       ON issues(epic_id);
CREATE INDEX idx_issues_status     ON issues(status_category);
CREATE INDEX idx_issues_parent     ON issues(parent_issue_id);
```

### MIGRATION_004 — policy (@fulcrum/policy)

```sql
CREATE TABLE policy_rules (
  rule_id     TEXT PRIMARY KEY,
  scope       TEXT NOT NULL
    CHECK(scope IN ('system','user','workspace','project','team_agent','workflow_step')),
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
CREATE INDEX idx_policy_rules_scope    ON policy_rules(scope, scope_id);
CREATE INDEX idx_policy_rules_priority ON policy_rules(priority DESC);
CREATE INDEX idx_policy_rules_enabled  ON policy_rules(enabled);

CREATE TABLE policy_events (
  evt_id        TEXT PRIMARY KEY,
  rule_id       TEXT REFERENCES policy_rules(rule_id),
  workspace_id  TEXT NOT NULL,
  action        TEXT NOT NULL,
  matched       INTEGER NOT NULL DEFAULT 0,
  actor_id      TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  ts            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_policy_events_workspace ON policy_events(workspace_id);
CREATE INDEX idx_policy_events_ts        ON policy_events(ts);
```

### MIGRATION_005 — memory enrichment (@fulcrum/memory)

Memory table extended (ALTER TABLE from MIGRATION_001 base) and `memory_entities` junction added:

```sql
-- memory_entities: flexible entity linking (scope column retained for fast bucketing)
CREATE TABLE memory_entities (
  memory_id     TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,  -- 'project'|'issue'|'task'|'file'|'agent'|'decision'
  entity_id     TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'subject_of',
  PRIMARY KEY (memory_id, entity_type, entity_id)
);
CREATE INDEX idx_memory_entities_entity ON memory_entities(entity_type, entity_id);

-- Code chunk index (separate from memories — for RAG ingestion pipeline)
CREATE TABLE code_chunks (
  chunk_id       TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id     TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
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
CREATE INDEX idx_chunks_project   ON code_chunks(project_id);
CREATE INDEX idx_chunks_file      ON code_chunks(file_path);
CREATE INDEX idx_chunks_hash      ON code_chunks(content_hash);
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks
  USING vec0(embedding float[1024]);
```

### MIGRATION_006 — teams + workflows (@fulcrum/teams, @fulcrum/workflows)

```sql
CREATE TABLE team_templates (
  template_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  slots       TEXT NOT NULL DEFAULT '[]',
  policy      TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE team_instances (
  instance_id          TEXT PRIMARY KEY,
  template_id          TEXT NOT NULL REFERENCES team_templates(template_id),
  workspace_id         TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id           TEXT REFERENCES projects(project_id),
  display_id           TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','ready','spawning','running','waiting',
                     'blocked','completed','failed','cancelled')),
  status_category      TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  purpose              TEXT NOT NULL,
  task_id              TEXT REFERENCES tasks(task_id),
  created_by_agent_id  TEXT NOT NULL,
  resolved_slots       TEXT NOT NULL DEFAULT '{}',
  version              INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_team_instances_workspace ON team_instances(workspace_id);
CREATE INDEX idx_team_instances_status    ON team_instances(status_category);

CREATE TABLE team_members (
  instance_id TEXT NOT NULL REFERENCES team_instances(instance_id) ON DELETE CASCADE,
  slot_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  role        TEXT NOT NULL,
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (instance_id, slot_id, agent_id)
);

CREATE TABLE workflow_runs (
  wf_id            TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id),
  display_id       TEXT NOT NULL,
  workflow_name    TEXT NOT NULL,
  workflow_version TEXT NOT NULL DEFAULT '1.0',
  status           TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','ready','running','waiting_input','waiting_dependency',
                     'blocked','failed','completed','cancelled')),
  status_category  TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  task_id          TEXT REFERENCES tasks(task_id),
  issue_id         TEXT REFERENCES issues(issue_id),
  steps            TEXT NOT NULL DEFAULT '[]',
  current_step_id  TEXT,
  handoff_refs     TEXT NOT NULL DEFAULT '[]',
  artifact_refs    TEXT NOT NULL DEFAULT '[]',
  error            TEXT,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  started_at       TEXT,
  completed_at     TEXT
);
CREATE INDEX idx_wf_runs_workspace ON workflow_runs(workspace_id);
CREATE INDEX idx_wf_runs_status    ON workflow_runs(status_category);
```

### MIGRATION_007 — worktrees + artifacts + reviews (@fulcrum/worktrees)

```sql
CREATE TABLE artifacts (
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

CREATE TABLE reviews (
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

CREATE TABLE worktrees (
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

CREATE TABLE handoffs (
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
    CHECK(handoff_mode IN ('artifact_first_brief','context_first','goal_first','resource_first')),
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artifact_contracts (
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

-- Junction tables
CREATE TABLE agentrun_artifacts (
  run_id      TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, artifact_id)
);
CREATE TABLE review_targets (
  review_id   TEXT NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  PRIMARY KEY (review_id, artifact_id)
);
CREATE TABLE task_memory_links (
  task_id   TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  memory_id TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, memory_id)
);
CREATE TABLE artifact_memory_links (
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  memory_id   TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
  PRIMARY KEY (artifact_id, memory_id)
);
CREATE TABLE project_submodules (
  parent_project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  child_project_id  TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  submodule_path    TEXT NOT NULL,
  PRIMARY KEY (parent_project_id, child_project_id)
);
```

### MIGRATION_008 — sync (@fulcrum/sync)

```sql
CREATE TABLE sync_states (
  sync_id          TEXT PRIMARY KEY,
  object_type      TEXT NOT NULL,
  object_id        TEXT NOT NULL,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  sync_target      TEXT NOT NULL DEFAULT 'plane',
  external_id      TEXT,
  last_synced_at   TEXT,
  sync_status      TEXT NOT NULL DEFAULT 'never_synced'
    CHECK(sync_status IN ('never_synced','queued','syncing','synced',
                          'conflicted','failed','disabled')),
  last_sync_hash   TEXT,
  last_sync_error  TEXT,
  direction        TEXT NOT NULL DEFAULT 'local_to_remote'
    CHECK(direction IN ('local_to_remote','remote_to_local','bidirectional')),
  conflict_state   TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(object_id, sync_target)
);

CREATE TABLE sync_conflicts (
  conflict_id  TEXT PRIMARY KEY,
  sync_id      TEXT NOT NULL REFERENCES sync_states(sync_id),
  local_hash   TEXT,
  remote_hash  TEXT,
  detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolution   TEXT CHECK(resolution IN ('local_wins','remote_wins','manual')),
  resolved_at  TEXT,
  resolved_by  TEXT
);

CREATE TABLE sync_queue (
  queue_id     TEXT PRIMARY KEY,
  sync_id      TEXT NOT NULL REFERENCES sync_states(sync_id),
  operation    TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
  priority     INTEGER NOT NULL DEFAULT 100,
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sync_queue_scheduled ON sync_queue(scheduled_at);
CREATE INDEX idx_sync_queue_priority  ON sync_queue(priority DESC);
```

### MIGRATION_009 — analytics (@fulcrum/monitor)

```sql
CREATE TABLE analytics_daily (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id        TEXT NOT NULL,
  date              TEXT NOT NULL,
  issues_created    INTEGER NOT NULL DEFAULT 0,
  issues_closed     INTEGER NOT NULL DEFAULT 0,
  tasks_created     INTEGER NOT NULL DEFAULT 0,
  tasks_completed   INTEGER NOT NULL DEFAULT 0,
  tasks_blocked     INTEGER NOT NULL DEFAULT 0,
  runs_started      INTEGER NOT NULL DEFAULT 0,
  runs_finished     INTEGER NOT NULL DEFAULT 0,
  runs_failed       INTEGER NOT NULL DEFAULT 0,
  memory_writes     INTEGER NOT NULL DEFAULT 0,
  memory_recalls    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, project_id, date)
);

CREATE TABLE analytics_cycle (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT NOT NULL,
  cycle_id         TEXT NOT NULL,
  committed        INTEGER NOT NULL DEFAULT 0,
  completed        INTEGER NOT NULL DEFAULT 0,
  scope_added      INTEGER NOT NULL DEFAULT 0,
  rolled_over      INTEGER NOT NULL DEFAULT 0,
  avg_cycle_time_h REAL
);

CREATE TABLE analytics_project (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT NOT NULL,
  date             TEXT NOT NULL,
  wip_count        INTEGER NOT NULL DEFAULT 0,
  throughput       INTEGER NOT NULL DEFAULT 0,
  lead_time_h      REAL,
  blocked_h        REAL,
  UNIQUE(workspace_id, project_id, date)
);

CREATE TABLE analytics_agent (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  agent_id             TEXT NOT NULL,
  date                 TEXT NOT NULL,
  runs_started         INTEGER NOT NULL DEFAULT 0,
  runs_completed       INTEGER NOT NULL DEFAULT 0,
  runs_blocked         INTEGER NOT NULL DEFAULT 0,
  runs_failed          INTEGER NOT NULL DEFAULT 0,
  avg_duration_min     REAL,
  handoff_count        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, agent_id, date)
);

CREATE TABLE analytics_team (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  instance_id           TEXT NOT NULL,
  date                  TEXT NOT NULL,
  tasks_completed       INTEGER NOT NULL DEFAULT 0,
  avg_slot_duration_min REAL,
  concurrency_peak      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, instance_id, date)
);
```

---

## Package API Shapes

### @fulcrum/core (extended)
```typescript
// Existing 14 functions stay. New additions:
export function emitEvent(input: EmitEventInput): void  // sync, fire-and-forget
export function nextDisplayId(entityType: string, projectId: string, db: Database): string
export function statusCategory(status: string, entityType: string): StatusCategory

// Extended types exported:
export type { AgentRole, MemoryKind, MemoryScope, ArtifactType, EventType,
              TaskRelationType, StatusCategory, ... }
```

### @fulcrum/planning
```typescript
export async function createEpic(input: CreateEpicInput): Promise<Epic>
export async function updateEpic(input: UpdateEpicInput): Promise<Epic>
export async function listEpics(input: ListEpicsInput): Promise<Epic[]>
export async function createIssue(input: CreateIssueInput): Promise<Issue>
export async function updateIssue(input: UpdateIssueInput): Promise<Issue>
export async function listIssues(input: ListIssuesInput): Promise<Issue[]>
export async function createPRD(input: CreatePRDInput): Promise<PRD>
export async function updatePRD(input: UpdatePRDInput): Promise<PRD>
export async function createPlan(input: CreatePlanInput): Promise<Plan>
export async function updatePlan(input: UpdatePlanInput): Promise<Plan>
export async function linkIssueToPlan(input: LinkIssueToPlanInput): Promise<void>
export async function addTaskRelation(input: AddTaskRelationInput): Promise<void>
export async function removeTaskRelation(input: RemoveTaskRelationInput): Promise<void>
export async function getBlockers(taskId: string): Promise<Task[]>
```

### @fulcrum/policy
```typescript
export async function evaluatePolicy(input: EvaluatePolicyInput): Promise<PolicyDecision>
export async function createPolicyRule(input: CreatePolicyRuleInput): Promise<PolicyRule>
export async function listPolicyRules(input: ListPolicyRulesInput): Promise<PolicyRule[]>
export function checkSecrets(text: string): SecretScanResult  // sync
export async function getAuditLog(input: GetAuditLogInput): Promise<PolicyEvent[]>

// SYSTEM_INVARIANTS loaded at startup, priority 1000, not overridable:
// - only chief_of_staff can invoke teams
// - only integration_worker can merge
// - no agent writes to project root without task assignment
```

### @fulcrum/memory (extends existing writeMemory/recallMemory)
```typescript
// Extended recall with modes:
export async function recallMemory(input: RecallMemoryInput): Promise<Memory[]>
// RecallMemoryInput.mode: 'compact' | 'total_ranked' | 'total_timeline' | 'total_sourcemap'

// New:
export async function ingestProject(input: IngestProjectInput): Promise<IngestResult>
export async function ingestFile(input: IngestFileInput): Promise<IngestResult>
export async function searchChunks(input: SearchChunksInput): Promise<CodeChunk[]>
export async function linkMemoryToEntity(input: LinkMemoryInput): Promise<void>

// Hybrid recall uses RRF (k=60) combining FTS5 + vector scores
// importance computed dynamically: (access_count * 0.3) + (entity_links * 0.4) + (confidence * 0.3)
// freshness computed dynamically: 1.0 - (days_since_update / 90)
```

### @fulcrum/teams
```typescript
export async function createTeamTemplate(input: CreateTeamTemplateInput): Promise<TeamTemplate>
export async function invokeTeam(input: InvokeTeamInput): Promise<TeamInstance>
// invokeTeam validates caller is chief_of_staff via policy engine
export async function heartbeatTeam(input: HeartbeatTeamInput): Promise<TeamInstance>
export async function completeTeam(input: CompleteTeamInput): Promise<TeamInstance>
export async function listTeamInstances(input: ListTeamInstancesInput): Promise<TeamInstance[]>
export async function getTeamStatus(input: GetTeamStatusInput): Promise<TeamStatus>
// TeamStatus includes slot occupancy, concurrency caps, active member count
```

### @fulcrum/workflows
```typescript
export async function startWorkflow(input: StartWorkflowInput): Promise<WorkflowRun>
export async function stepWorkflow(input: StepWorkflowInput): Promise<WorkflowRun>
export async function resumeWorkflow(input: ResumeWorkflowInput): Promise<WorkflowRun>
export async function cancelWorkflow(input: CancelWorkflowInput): Promise<WorkflowRun>
export async function listWorkflows(): Promise<WorkflowDefinition[]>
export async function getWorkflowRun(input: GetWorkflowRunInput): Promise<WorkflowRun>

// Built-in workflows registered at startup:
// 'grill-me', 'write-a-prd', 'prd-to-plan', 'prd-to-issues'
// Custom workflows loaded from project .fulcrum/workflows/*.yaml
```

### @fulcrum/worktrees
```typescript
export async function allocateWorktree(input: AllocateWorktreeInput): Promise<Worktree>
export async function markDirty(input: MarkDirtyInput): Promise<Worktree>
export async function markReadyForMerge(input: MarkReadyInput): Promise<Worktree>
export async function enqueueMerge(input: EnqueueMergeInput): Promise<void>
export async function processMergeQueue(projectId: string): Promise<MergeResult[]>
// processMergeQueue validates caller is integration_worker via policy engine
export async function discardWorktree(input: DiscardWorktreeInput): Promise<void>
export async function listMergeQueue(projectId: string): Promise<Worktree[]>
```

### @fulcrum/monitor
```typescript
export async function getMetrics(input: GetMetricsInput): Promise<Metrics>
export async function getBurndown(input: GetBurndownInput): Promise<BurndownData>
export async function getAgentMetrics(input: GetAgentMetricsInput): Promise<AgentMetrics>
export function startMonitorServer(config: MonitorServerConfig): MonitorServer
// MonitorServer: Hono app with SSE endpoint at /events, REST at /metrics /burndown /status
// SSE pushes events from the events table in real-time
export async function replayRun(input: ReplayRunInput): Promise<RunReplay>
```

### @fulcrum/sync
```typescript
export async function syncObject(input: SyncObjectInput): Promise<SyncState>
export async function syncAll(input: SyncAllInput): Promise<SyncResult>
export async function getSyncState(input: GetSyncStateInput): Promise<SyncState>
export async function resolveConflict(input: ResolveConflictInput): Promise<SyncState>
export async function listConflicts(input: ListConflictsInput): Promise<SyncConflict[]>

// PlaneSyncAdapter implements SyncAdapter interface:
// interface SyncAdapter { push(obj): Promise<string>, pull(externalId): Promise<unknown>,
//                         map(local): ExternalPayload, unmap(external): LocalPayload }
// Syncable types: Issue, Task, Epic, PRD, Plan, Review, Artifact, TeamInstance, WorkflowRun
// Never synced: Memory, PolicyRule, AgentRun, Event, Worktree, HandoffPacket, ArtifactContract
```

---

## Policy Engine Design

### SYSTEM_INVARIANTS (priority 1000, hardcoded, cannot be overridden)
1. `only chief_of_staff invokes teams` — any `invokeTeam()` call not from role=chief_of_staff → deny
2. `only integration_worker merges` — any `processMergeQueue()` call not from role=integration_worker → deny
3. `no task assignment bypass` — agent cannot start work without a task_id
4. `no secret storage` — SecretGuard blocks storing API key patterns in memory/artifacts/logs

### SecretGuard — 5 Detection Patterns
1. API key patterns: `(sk|pk|api|key|token|secret)[-_][a-zA-Z0-9]{20,}`
2. Private keys: `-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----`
3. OAuth tokens: `(ghp|ghu|ghs|gho)_[a-zA-Z0-9]{36}`
4. Passwords in KV: `(password|passwd|pwd|secret)\s*[=:]\s*\S+`
5. Credentials in URLs: `[a-zA-Z][^:]*:[^@]+@`

### Evaluation Order
1. SYSTEM_INVARIANTS (priority 1000) — if deny, block immediately
2. Scope-specific rules (workspace, project, team, step) — most specific wins
3. Default: allow

---

## Memory Recall Design

### RRF Hybrid Search (k=60)
```
rrf_score = (1 / (60 + fts_rank)) + (1 / (60 + vector_rank))
```
Items appearing only in one result set get rank=1000 in the other. FULL OUTER JOIN — items in only one set are still included.

### 4 Recall Modes
- `compact` — top 8, returns: memory_id, title, summary, scope, kind, file_path, confidence only
- `total_ranked` — full records, RRF-ranked
- `total_timeline` — full records, sorted by event_time ASC
- `total_sourcemap` — full records, sorted by file_path + symbol_path, emphasis on code navigation

### Dynamic Scoring
```typescript
function importance(m: Memory): number {
  const accessScore    = Math.min(m.access_count / 100, 1) * 0.3
  const entityScore    = Math.min(m.entity_links / 10, 1) * 0.4
  const confidenceScore = m.confidence * 0.3
  return accessScore + entityScore + confidenceScore
}

function freshness(m: Memory): number {
  const daysSinceUpdate = (Date.now() - Date.parse(m.updated_at)) / 86_400_000
  return Math.max(0, 1 - daysSinceUpdate / 90)
}
```

---

## Workflow Engine Design

### DAG State Machine
- Full step state persisted in `workflow_runs.steps` JSON column
- Resume: rehydrate from steps JSON, skip completed steps, continue from current_step_id
- Retry: per-step `max_retries` (default 3), exponential backoff
- Step types: 17 (see types section above)
- Blocking steps (prompt_user, wait_for_task): set status to `waiting_input` / `waiting_dependency`, suspend — resume on external signal

### 4 Built-in Workflows

**grill-me** — interactive discovery
Steps: prompt_user → search_web → read_memory → write_memory → complete

**write-a-prd** — PRD generation
Steps: read_memory → prompt_user → spawn_agent(prd_planner) → write_artifact(prd) → write_memory → complete

**prd-to-plan** — plan from PRD
Steps: read_memory(prd) → spawn_agent(implementation_planner) → create_task(×N) → write_artifact(plan) → complete

**prd-to-issues** — issues from PRD
Steps: read_memory(prd) → spawn_agent(issue_decomposer) → create_issue(×N) → complete

Custom workflows loaded from `.fulcrum/workflows/*.yaml` at startup.

---

## Worktree Design

### Allocation Strategy
- `project.project_type = 'git'` AND `project.write_mode = 'worktree'` → allocate git worktree
- `project.write_mode = 'sequential'` or non-git → no worktree, single writer enforced by policy
- Submodule projects: child first, parent after (cascade isolation)

### Merge Readiness Requirements
1. Branch ≤ 20 commits behind parent default_branch
2. No unresolved merge conflicts (git merge-tree dry-run passes)
3. All artifact contracts satisfied (required_artifacts produced)
4. All required reviews approved
5. SecretGuard passes on changed files

### Merge Queue
- Owned exclusively by `integration_worker` role
- FIFO within priority tier
- On conflict: re-queue with agent context (agent-first resolution)
- On security finding: escalate to human, pause queue for that project

---

## Monitor Server Design

Hono app (lightweight, no overhead):
- `GET /status` — workspace status snapshot
- `GET /metrics` — analytics aggregates
- `GET /burndown` — burndown data for project
- `GET /events/stream` — SSE, pushes new events from events table (polling every 2s)
- `GET /runs/:id/replay` — run replay from events

SSE transport: `EventSource`-compatible. Client reconnects on disconnect. Server filters by workspace_id from query param.

Local-only by design: no auth, binds to 127.0.0.1 only, port configurable in `.fulcrum.json`.

---

## Plane Sync Design

### 3-Layer Adapter
- **PlaneAPIClient** — raw REST calls to Plane API, handles auth, rate limits, retries
- **PlaneSyncAdapter** — maps local objects to Plane payloads, implements `SyncAdapter` interface
- **SyncManager** — queue management, batch processing, event-triggered sync, conflict resolution

### Sync Flow
1. Object changes → `sync_queue` entry added in same transaction
2. SyncManager processes queue async (batch every 30s or on-demand)
3. SecretGuard applied before transmission
4. Hash comparison: `SHA256(canonicalize(local))` vs `last_sync_hash`
5. If conflict: record in `sync_conflicts`, default resolution = `local_wins`
6. `external_id` stored in `sync_states` for bidirectional round-tripping

### Denied Sync Types
Memory, PolicyRule, AgentRun, Event, Worktree, HandoffPacket, ArtifactContract — never leave local SQLite.

---

## Testing Strategy

Each package: vitest, `pool: 'forks'` (required for better-sqlite3), `setDb()` injection pattern.

Coverage targets per package:
- `core`: all public functions, error paths, concurrent writes
- `planning`: state machine transitions, display_id sequences, circular dependency detection
- `policy`: all 8 matcher types, SYSTEM_INVARIANTS, SecretGuard patterns
- `memory`: all 4 recall modes, RRF scoring, dedup, ingestion pipeline
- `teams`: slot routing, concurrency caps, L1 enforcement
- `workflows`: all 17 step types, DAG resumability, retry logic, 4 built-in workflows
- `worktrees`: allocation, merge queue, conflict handling, sequential enforcement
- `monitor`: metrics aggregation, SSE emission, burndown calculation
- `sync`: queue processing, conflict resolution, secret redaction

All embedding/model-dependent tests behind `FULCRUM_EMBEDDING_TESTS=1` env flag.
