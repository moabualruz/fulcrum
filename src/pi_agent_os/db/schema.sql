-- PI Agent OS SQLite Schema
-- Requires SQLite with FTS5 support
-- All IDs are typed prefixed ULIDs (TEXT)
-- All datetimes are ISO 8601 TEXT
-- Booleans are INTEGER 0/1

-- =============================================================================
-- CORE OBJECT TABLES
-- =============================================================================

-- workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    config_path TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    project_type TEXT NOT NULL DEFAULT 'git',  -- git|non_git|submodule|logical
    root_path TEXT DEFAULT '',
    default_branch TEXT,
    parent_project_id TEXT REFERENCES projects(id),
    status TEXT NOT NULL DEFAULT 'active',
    write_mode TEXT NOT NULL DEFAULT 'sequential',  -- sequential|worktree
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- epics
CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    display_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    milestone_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- issues
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    epic_id TEXT REFERENCES epics(id),
    display_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    assignee_agent_id TEXT,
    estimate REAL,
    labels TEXT DEFAULT '[]',  -- JSON array
    parent_issue_id TEXT REFERENCES issues(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    issue_id TEXT REFERENCES issues(id),
    display_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_agent_id TEXT,
    assigned_run_id TEXT,
    estimate REAL,
    done_criteria TEXT,
    blockers TEXT DEFAULT '[]',  -- JSON array
    labels TEXT DEFAULT '[]',    -- JSON array
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    claimed_at TEXT,
    completed_at TEXT
);

-- prds
CREATE TABLE IF NOT EXISTS prds (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    display_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    file_path TEXT NOT NULL DEFAULT '',
    linked_epic_id TEXT REFERENCES epics(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- plans
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    display_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    prd_id TEXT REFERENCES prds(id),
    file_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- agent_runs
CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    task_id TEXT REFERENCES tasks(id),
    display_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    pi_profile TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    current_step TEXT,
    current_path TEXT,
    progress_pct REAL,
    heartbeat_at TEXT,
    blocker TEXT,
    worktree_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);

-- worktrees
CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    status TEXT NOT NULL DEFAULT 'allocated',
    branch_name TEXT NOT NULL,
    path TEXT NOT NULL,
    task_id TEXT REFERENCES tasks(id),
    run_id TEXT REFERENCES agent_runs(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    merged_at TEXT,
    discarded_at TEXT
);

-- reviews
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    display_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reviewer_agent_id TEXT,
    summary TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- artifacts
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    display_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    content_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- team_templates
CREATE TABLE IF NOT EXISTS team_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    slots TEXT NOT NULL DEFAULT '[]',   -- JSON
    policy TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- team_instances
CREATE TABLE IF NOT EXISTS team_instances (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES team_templates(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT REFERENCES projects(id),
    status TEXT NOT NULL DEFAULT 'created',
    purpose TEXT NOT NULL DEFAULT '',
    task_id TEXT REFERENCES tasks(id),
    created_by_agent_id TEXT NOT NULL,
    resolved_slots TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- handoffs
CREATE TABLE IF NOT EXISTS handoffs (
    id TEXT PRIMARY KEY,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    task_id TEXT REFERENCES tasks(id),
    issue_id TEXT REFERENCES issues(id),
    project_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    goal TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium',
    scope TEXT NOT NULL DEFAULT '',
    inputs TEXT NOT NULL DEFAULT '{}',       -- JSON
    constraints TEXT NOT NULL DEFAULT '[]',  -- JSON array
    done_criteria TEXT NOT NULL DEFAULT '[]',-- JSON array
    artifact_contract_id TEXT,
    handoff_mode TEXT NOT NULL DEFAULT 'artifact_first_brief',
    created_at TEXT NOT NULL
);

-- artifact_contracts
CREATE TABLE IF NOT EXISTS artifact_contracts (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id),
    workflow_id TEXT,
    required_artifacts TEXT NOT NULL DEFAULT '[]',   -- JSON
    optional_artifacts TEXT NOT NULL DEFAULT '[]',   -- JSON
    final_summary_artifact TEXT,
    review_inputs TEXT NOT NULL DEFAULT '[]',         -- JSON
    merge_readiness_rules TEXT NOT NULL DEFAULT '[]', -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- workflow_runs
CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT REFERENCES projects(id),
    workflow_name TEXT NOT NULL,
    workflow_version TEXT NOT NULL DEFAULT '1.0',
    status TEXT NOT NULL DEFAULT 'created',
    task_id TEXT REFERENCES tasks(id),
    issue_id TEXT REFERENCES issues(id),
    steps TEXT NOT NULL DEFAULT '[]',         -- JSON
    current_step_id TEXT,
    handoff_refs TEXT NOT NULL DEFAULT '[]',  -- JSON
    artifact_refs TEXT NOT NULL DEFAULT '[]', -- JSON
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

-- cycles
CREATE TABLE IF NOT EXISTS cycles (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- milestones
CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- =============================================================================
-- RELATION TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS issue_subissues (
    parent_issue_id TEXT NOT NULL REFERENCES issues(id),
    child_issue_id TEXT NOT NULL REFERENCES issues(id),
    PRIMARY KEY (parent_issue_id, child_issue_id)
);

CREATE TABLE IF NOT EXISTS issue_tasks (
    issue_id TEXT NOT NULL REFERENCES issues(id),
    task_id TEXT NOT NULL REFERENCES tasks(id),
    PRIMARY KEY (issue_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    depends_on_task_id TEXT NOT NULL REFERENCES tasks(id),
    relation_type TEXT NOT NULL DEFAULT 'blocks',  -- blocks|requires_context_from|must_merge_before|conflicts_with|reviewed_by|verifies
    PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS task_memory_links (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    memory_id TEXT NOT NULL,
    PRIMARY KEY (task_id, memory_id)
);

CREATE TABLE IF NOT EXISTS artifact_memory_links (
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    memory_id TEXT NOT NULL,
    PRIMARY KEY (artifact_id, memory_id)
);

CREATE TABLE IF NOT EXISTS agentrun_artifacts (
    run_id TEXT NOT NULL REFERENCES agent_runs(id),
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    PRIMARY KEY (run_id, artifact_id)
);

CREATE TABLE IF NOT EXISTS review_targets (
    review_id TEXT NOT NULL REFERENCES reviews(id),
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    PRIMARY KEY (review_id, artifact_id)
);

CREATE TABLE IF NOT EXISTS project_submodules (
    parent_project_id TEXT NOT NULL REFERENCES projects(id),
    child_project_id TEXT NOT NULL REFERENCES projects(id),
    submodule_path TEXT NOT NULL,
    PRIMARY KEY (parent_project_id, child_project_id)
);

CREATE TABLE IF NOT EXISTS team_members (
    instance_id TEXT NOT NULL REFERENCES team_instances(id),
    slot_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (instance_id, slot_id)
);

CREATE TABLE IF NOT EXISTS plan_issues (
    plan_id TEXT NOT NULL REFERENCES plans(id),
    issue_id TEXT NOT NULL REFERENCES issues(id),
    PRIMARY KEY (plan_id, issue_id)
);

CREATE TABLE IF NOT EXISTS prd_plans (
    prd_id TEXT NOT NULL REFERENCES prds(id),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    PRIMARY KEY (prd_id, plan_id)
);

-- =============================================================================
-- PROJECTION TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS board_items (
    id TEXT PRIMARY KEY,  -- same as source object id
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    item_type TEXT NOT NULL,  -- issue|task|epic
    display_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    assignee_id TEXT,
    epic_id TEXT,
    issue_id TEXT,
    cycle_id TEXT,
    milestone_id TEXT,
    labels TEXT DEFAULT '[]',
    estimate REAL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_state_projection (
    task_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    run_id TEXT,
    agent_id TEXT,
    current_step TEXT,
    blocker TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_state_projection (
    issue_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    open_task_count INTEGER DEFAULT 0,
    completed_task_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_state_projection (
    run_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    pi_profile TEXT,
    status TEXT NOT NULL,
    task_id TEXT,
    current_step TEXT,
    current_path TEXT,
    progress_pct REAL,
    heartbeat_at TEXT,
    blocker TEXT,
    worktree_id TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_state_projection (
    instance_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    template_id TEXT NOT NULL,
    status TEXT NOT NULL,
    purpose TEXT NOT NULL,
    active_member_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merge_queue_projection (
    worktree_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    task_id TEXT,
    run_id TEXT,
    status TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    queued_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_queue_projection (
    review_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL,
    reviewer_agent_id TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_trace_projection (
    memory_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    file_path TEXT,
    task_id TEXT,
    importance REAL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_projection (
    object_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    sync_target TEXT NOT NULL DEFAULT 'plane',
    external_id TEXT,
    sync_status TEXT NOT NULL DEFAULT 'never_synced',
    last_synced_at TEXT,
    conflict_state TEXT,
    updated_at TEXT NOT NULL
);

-- =============================================================================
-- ANALYTICS TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_daily (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    date TEXT NOT NULL,
    issues_created INTEGER DEFAULT 0,
    issues_closed INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tasks_blocked INTEGER DEFAULT 0,
    runs_started INTEGER DEFAULT 0,
    runs_finished INTEGER DEFAULT 0,
    runs_failed INTEGER DEFAULT 0,
    memory_writes INTEGER DEFAULT 0,
    memory_recalls INTEGER DEFAULT 0,
    UNIQUE(workspace_id, project_id, date)
);

CREATE TABLE IF NOT EXISTS analytics_cycle (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    committed_issues INTEGER DEFAULT 0,
    completed_issues INTEGER DEFAULT 0,
    added_scope INTEGER DEFAULT 0,
    rolled_over INTEGER DEFAULT 0,
    avg_cycle_time_hours REAL
);

CREATE TABLE IF NOT EXISTS analytics_project (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    date TEXT NOT NULL,
    wip_count INTEGER DEFAULT 0,
    throughput_daily REAL DEFAULT 0.0,
    avg_lead_time_hours REAL,
    avg_blocked_hours REAL
);

CREATE TABLE IF NOT EXISTS analytics_agent (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    date TEXT NOT NULL,
    runs_started INTEGER DEFAULT 0,
    runs_completed INTEGER DEFAULT 0,
    runs_blocked INTEGER DEFAULT 0,
    runs_failed INTEGER DEFAULT 0,
    avg_duration_minutes REAL,
    handoff_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_team (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    date TEXT NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    avg_slot_duration_minutes REAL,
    concurrency_peak INTEGER DEFAULT 0
);

-- =============================================================================
-- POLICY AND SYNC TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_rules (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    action TEXT NOT NULL,
    matchers TEXT NOT NULL DEFAULT '[]',  -- JSON
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT,
    action_taken TEXT NOT NULL,
    trigger TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    resource TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    timestamp TEXT NOT NULL,
    details TEXT DEFAULT '{}'  -- JSON
);

CREATE TABLE IF NOT EXISTS sync_states (
    id TEXT PRIMARY KEY,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    sync_target TEXT NOT NULL DEFAULT 'plane',
    external_id TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'never_synced',
    last_sync_hash TEXT,
    last_sync_error TEXT,
    direction TEXT NOT NULL DEFAULT 'local_to_remote',
    conflict_state TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(object_id, sync_target)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    sync_state_id TEXT NOT NULL REFERENCES sync_states(id),
    local_hash TEXT NOT NULL,
    remote_hash TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT  -- 'local_wins'|'remote_wins'|'manual'
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    sync_target TEXT NOT NULL DEFAULT 'plane',
    operation TEXT NOT NULL DEFAULT 'upsert',  -- upsert|delete
    priority INTEGER NOT NULL DEFAULT 0,
    queued_at TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_attempt_at TEXT,
    last_error TEXT
);

-- =============================================================================
-- EVENT LOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    evt_type TEXT NOT NULL,
    ts TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    object_type TEXT,
    object_id TEXT,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',  -- JSON
    severity TEXT NOT NULL DEFAULT 'info',
    trace_id TEXT,
    span_id TEXT,
    correlation_id TEXT
);

-- =============================================================================
-- MEMORY TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,        -- global|project|file
    kind TEXT NOT NULL,         -- fact|summary|symbol|decision|...
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    file_path TEXT,
    symbol_path TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    canonical_text TEXT,
    tags TEXT NOT NULL DEFAULT '[]',       -- JSON
    entities TEXT NOT NULL DEFAULT '[]',   -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    event_time TEXT,
    last_seen_at TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    freshness REAL NOT NULL DEFAULT 1.0,
    content_hash TEXT,
    task_id TEXT,
    issue_id TEXT,
    artifact_id TEXT,
    provenance_refs TEXT NOT NULL DEFAULT '[]'  -- JSON
);

-- =============================================================================
-- SCHEMA VERSIONING (MIGRATIONS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

-- =============================================================================
-- FTS5 VIRTUAL TABLES
-- =============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS issues_fts USING fts5(
    title, description,
    content=issues, content_rowid=rowid,
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
    title, description,
    content=tasks, content_rowid=rowid,
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
    title,
    content=artifacts, content_rowid=rowid,
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(
    title, description,
    content=plans, content_rowid=rowid,
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS prds_fts USING fts5(
    title, description,
    content=prds, content_rowid=rowid,
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    title, summary, canonical_text,
    content=memories, content_rowid=rowid,
    tokenize='porter unicode61'
);

-- =============================================================================
-- KEY INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_issues_workspace ON issues(workspace_id);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_issue ON tasks(issue_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_events_workspace ON events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(evt_type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
