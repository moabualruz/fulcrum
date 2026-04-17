// packages/memory/src/kuzu/schema.ts

export function buildMemoryNodeDDL(dims: number): string {
  return `
CREATE NODE TABLE IF NOT EXISTS Memory (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  kind STRING,
  scope STRING,
  title STRING,
  summary STRING,
  importance FLOAT,
  freshness FLOAT,
  confidence FLOAT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  embedding FLOAT[${dims}],
  PRIMARY KEY (id)
)`
}

export function buildEntityNodeDDL(dims: number): string {
  return `
CREATE NODE TABLE IF NOT EXISTS Entity (
  id STRING,
  canonical_name STRING,
  type STRING,
  scope STRING,
  aliases STRING[],
  description STRING,
  embedding FLOAT[${dims}],
  mention_count INT64,
  created_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  PRIMARY KEY (id)
)`
}

// Memory → Entity relationship tables
export const MENTIONS_DDL = `CREATE REL TABLE IF NOT EXISTS MENTIONS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const ABOUT_DDL = `CREATE REL TABLE IF NOT EXISTS ABOUT (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const USES_DDL = `CREATE REL TABLE IF NOT EXISTS USES (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const CRITIQUES_DDL = `CREATE REL TABLE IF NOT EXISTS CRITIQUES (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const RECOMMENDS_DDL = `CREATE REL TABLE IF NOT EXISTS RECOMMENDS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const AVOIDS_DDL = `CREATE REL TABLE IF NOT EXISTS AVOIDS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const PRODUCED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS PRODUCED_IN (FROM Memory TO Entity, weight FLOAT, source STRING, created_at TIMESTAMP)`

// Entity → Entity relationship tables
export const IS_A_DDL = `CREATE REL TABLE IF NOT EXISTS IS_A (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const PART_OF_DDL = `CREATE REL TABLE IF NOT EXISTS PART_OF (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const RELATED_TO_DDL = `CREATE REL TABLE IF NOT EXISTS RELATED_TO (FROM Entity TO Entity, weight FLOAT, source STRING, reinforcement_count INT64)`
export const ALIAS_OF_DDL = `CREATE REL TABLE IF NOT EXISTS ALIAS_OF (FROM Entity TO Entity, source STRING, confirmed BOOLEAN)`
export const CAUSES_DDL = `CREATE REL TABLE IF NOT EXISTS CAUSES (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const PREVENTS_DDL = `CREATE REL TABLE IF NOT EXISTS PREVENTS (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const USED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS USED_IN (FROM Entity TO Entity, weight FLOAT, computed_at TIMESTAMP)`

// Memory → Memory relationship tables
export const CONTRADICTS_DDL = `CREATE REL TABLE IF NOT EXISTS CONTRADICTS (FROM Memory TO Memory, confidence FLOAT, source STRING)`
export const UPDATES_DDL = `CREATE REL TABLE IF NOT EXISTS UPDATES (FROM Memory TO Memory, source STRING, created_at TIMESTAMP)`
export const REINFORCES_DDL = `CREATE REL TABLE IF NOT EXISTS REINFORCES (FROM Memory TO Memory, weight FLOAT, source STRING)`
export const ELABORATES_DDL = `CREATE REL TABLE IF NOT EXISTS ELABORATES (FROM Memory TO Memory, source STRING)`

// v2a PR 7 Tasks 35 + 36 — File / CodeChunk / Symbol nodes + 7 cross-type rel
// tables. Pre-resolved decision #7: NOT the full 51-table unification — just
// the memory + code surface so PR 4's PCI watcher has a graph target. v2b PR 10
// expands to the full ~20-table set; rel tables here are additive so the
// expansion is forward-compatible (no rebuilds required).

export function buildFileNodeDDL(): string {
  return `
CREATE NODE TABLE IF NOT EXISTS File (
  file_id STRING,
  workspace_id STRING,
  project_id STRING,
  rel_path STRING,
  language STRING,
  sha256 STRING,
  mtime_ns INT64,
  size_bytes INT64,
  indexed_at TIMESTAMP,
  PRIMARY KEY (file_id)
)`
}

export function buildCodeChunkNodeDDL(dims: number): string {
  return `
CREATE NODE TABLE IF NOT EXISTS CodeChunk (
  chunk_id STRING,
  file_id STRING,
  kind STRING,
  symbol_path STRING,
  start_line INT64,
  end_line INT64,
  embedding FLOAT[${dims}],
  PRIMARY KEY (chunk_id)
)`
}

export function buildSymbolNodeDDL(): string {
  return `
CREATE NODE TABLE IF NOT EXISTS Symbol (
  symbol_id STRING,
  file_id STRING,
  name STRING,
  kind STRING,
  line INT64,
  PRIMARY KEY (symbol_id)
)`
}

// Memory ↔ code edges (cross-type — Task 36 rels)
export const EDITS_DDL = `CREATE REL TABLE IF NOT EXISTS EDITS (FROM Memory TO File, weight FLOAT, source STRING, created_at TIMESTAMP)`
export const ABOUT_FILE_DDL = `CREATE REL TABLE IF NOT EXISTS ABOUT_FILE (FROM Memory TO File, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const ABOUT_SYMBOL_DDL = `CREATE REL TABLE IF NOT EXISTS ABOUT_SYMBOL (FROM Memory TO Symbol, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const MENTIONS_SYMBOL_DDL = `CREATE REL TABLE IF NOT EXISTS MENTIONS_SYMBOL (FROM Memory TO Symbol, weight FLOAT, source STRING, created_at TIMESTAMP)`

// Code ↔ code edges
export const IMPORTS_DDL = `CREATE REL TABLE IF NOT EXISTS IMPORTS (FROM File TO File, source STRING)`
export const CALLS_DDL = `CREATE REL TABLE IF NOT EXISTS CALLS (FROM Symbol TO Symbol, source STRING, weight FLOAT)`
export const DEFINES_DDL = `CREATE REL TABLE IF NOT EXISTS DEFINES (FROM File TO Symbol, source STRING)`
export const CONTAINED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS CONTAINED_IN (FROM CodeChunk TO File, source STRING)`

export const CODE_CHUNK_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('CodeChunk', 'code_chunk_embedding_idx', 'embedding', metric := 'cosine')`

// Vector indexes — run last; tables must exist first
export const MEMORY_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('Memory', 'memory_embedding_idx', 'embedding', metric := 'cosine')`
export const ENTITY_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('Entity', 'entity_embedding_idx', 'embedding', metric := 'cosine')`

// ─── v2b PR 10 Task 1.1 — 18 control-plane node types ─────────────────────

/** Returns 18 control-plane node DDLs (excludes team_members — that is a rel). */
export function buildControlPlaneDDL(_dims: number): string[] {
  return [
    `CREATE NODE TABLE IF NOT EXISTS Task (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  title STRING,
  status STRING,
  priority STRING,
  assigned_to STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS AgentRun (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  task_id STRING,
  agent_role STRING,
  context_type STRING,
  status STRING,
  model STRING,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS TeamInstance (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  template_id STRING,
  purpose STRING,
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS TeamTemplate (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  name STRING,
  description STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS WorkflowRun (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  template_id STRING,
  status STRING,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Handoff (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  from_run_id STRING,
  to_run_id STRING,
  message STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Artifact (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  kind STRING,
  path STRING,
  sha256 STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Review (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  artifact_id STRING,
  reviewer_role STRING,
  verdict STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Worktree (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  path STRING,
  branch STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Epic (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  title STRING,
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Issue (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  title STRING,
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Prd (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  title STRING,
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS Plan (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  title STRING,
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS ExternalRef (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  source STRING,
  external_id STRING,
  url STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS AgentAdapter (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  executor_uri STRING,
  model STRING,
  version STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS ArtifactContract (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  schema_json STRING,
  version STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS NotificationEvent (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  kind STRING,
  payload STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS PolicyEvent (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  rule_id STRING,
  action STRING,
  verdict STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
  ]
}

// ─── v2b PR 10 Task 1.2 — 4 git node types ────────────────────────────────

/** Returns 4 git node DDLs (git_commit, git_branch, git_pr, git_tag). */
export function buildGitDDL(): string[] {
  return [
    `CREATE NODE TABLE IF NOT EXISTS GitCommit (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  sha STRING,
  message STRING,
  author STRING,
  authored_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS GitBranch (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  name STRING,
  is_default BOOLEAN,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS GitPr (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  number INT64,
  title STRING,
  state STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
    `CREATE NODE TABLE IF NOT EXISTS GitTag (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  name STRING,
  sha STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
)`,
  ]
}

// ─── v2b PR 10 Task 1.3 — ~25 control-plane rel tables ────────────────────

export const ASSIGNED_TO_DDL = `CREATE REL TABLE IF NOT EXISTS ASSIGNED_TO (FROM Task TO AgentRun, created_at TIMESTAMP)`
export const BLOCKED_BY_DDL = `CREATE REL TABLE IF NOT EXISTS BLOCKED_BY (FROM Task TO Task, reason STRING)`
export const DELIVERED_BY_DDL = `CREATE REL TABLE IF NOT EXISTS DELIVERED_BY (FROM Task TO Artifact, created_at TIMESTAMP)`
export const DEPENDS_ON_DDL = `CREATE REL TABLE IF NOT EXISTS DEPENDS_ON (FROM Task TO Task, created_at TIMESTAMP)`
export const HAS_OUTCOME_DDL = `CREATE REL TABLE IF NOT EXISTS HAS_OUTCOME (FROM Task TO Memory, created_at TIMESTAMP)`
export const PRODUCED_DDL = `CREATE REL TABLE IF NOT EXISTS PRODUCED (FROM AgentRun TO Memory, created_at TIMESTAMP)`
export const EDITED_RUN_DDL = `CREATE REL TABLE IF NOT EXISTS EDITED_RUN (FROM AgentRun TO File, created_at TIMESTAMP)`
export const HANDLED_DDL = `CREATE REL TABLE IF NOT EXISTS HANDLED (FROM AgentRun TO Handoff, created_at TIMESTAMP)`
export const PART_OF_RUN_DDL = `CREATE REL TABLE IF NOT EXISTS PART_OF_RUN (FROM AgentRun TO TeamInstance, role_slot STRING)`
export const HIT_DDL = `CREATE REL TABLE IF NOT EXISTS HIT (FROM AgentRun TO Memory, hook_point STRING, created_at TIMESTAMP)`
export const INSTANTIATED_FROM_DDL = `CREATE REL TABLE IF NOT EXISTS INSTANTIATED_FROM (FROM TeamInstance TO TeamTemplate, created_at TIMESTAMP)`
export const EXECUTED_BY_DDL = `CREATE REL TABLE IF NOT EXISTS EXECUTED_BY (FROM AgentRun TO AgentAdapter, created_at TIMESTAMP)`
export const MEMBER_OF_DDL = `CREATE REL TABLE IF NOT EXISTS MEMBER_OF (FROM AgentRun TO TeamInstance, role_slot STRING)`
export const LANDED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS LANDED_IN (FROM File TO GitCommit, created_at TIMESTAMP)`
export const ON_BRANCH_DDL = `CREATE REL TABLE IF NOT EXISTS ON_BRANCH (FROM GitCommit TO GitBranch, created_at TIMESTAMP)`
export const INCLUDES_COMMIT_DDL = `CREATE REL TABLE IF NOT EXISTS INCLUDES_COMMIT (FROM GitPr TO GitCommit, created_at TIMESTAMP)`
export const DELIVERED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS DELIVERED_IN (FROM Artifact TO GitPr, created_at TIMESTAMP)`
export const POINTS_AT_DDL = `CREATE REL TABLE IF NOT EXISTS POINTS_AT (FROM Worktree TO GitBranch, created_at TIMESTAMP)`
export const SHADOW_OF_DDL = `CREATE REL TABLE IF NOT EXISTS SHADOW_OF (FROM Task TO ExternalRef, created_at TIMESTAMP)`
export const CONFORMS_TO_DDL = `CREATE REL TABLE IF NOT EXISTS CONFORMS_TO (FROM Artifact TO ArtifactContract, created_at TIMESTAMP)`
export const CHECKS_DDL = `CREATE REL TABLE IF NOT EXISTS CHECKS (FROM Review TO ArtifactContract, created_at TIMESTAMP)`
export const EVALUATED_DDL = `CREATE REL TABLE IF NOT EXISTS EVALUATED (FROM PolicyEvent TO AgentRun, rule_id STRING, created_at TIMESTAMP)`
export const DECIDED_ON_DDL = `CREATE REL TABLE IF NOT EXISTS DECIDED_ON (FROM PolicyEvent TO AgentRun, verdict STRING, created_at TIMESTAMP)`
export const TRIGGERED_BY_DDL = `CREATE REL TABLE IF NOT EXISTS TRIGGERED_BY (FROM NotificationEvent TO AgentRun, created_at TIMESTAMP)`
export const RAN_AS_DDL = `CREATE REL TABLE IF NOT EXISTS RAN_AS (FROM WorkflowRun TO AgentRun, created_at TIMESTAMP)`

export function buildAllDDL(dims: number): string[] {
  return [
    // ── v2a nodes ─────────────────────────────────────────────────────────
    buildMemoryNodeDDL(dims),
    buildEntityNodeDDL(dims),
    buildFileNodeDDL(),
    buildCodeChunkNodeDDL(dims),
    buildSymbolNodeDDL(),
    // ── v2b Task 1.1 — control-plane nodes ────────────────────────────────
    ...buildControlPlaneDDL(dims),
    // ── v2b Task 1.2 — git nodes ──────────────────────────────────────────
    ...buildGitDDL(),
    // ── v2a rel tables — Memory → Entity ─────────────────────────────────
    MENTIONS_DDL,
    ABOUT_DDL,
    USES_DDL,
    CRITIQUES_DDL,
    RECOMMENDS_DDL,
    AVOIDS_DDL,
    PRODUCED_IN_DDL,
    // Entity → Entity
    IS_A_DDL,
    PART_OF_DDL,
    RELATED_TO_DDL,
    ALIAS_OF_DDL,
    CAUSES_DDL,
    PREVENTS_DDL,
    USED_IN_DDL,
    // Memory → Memory
    CONTRADICTS_DDL,
    UPDATES_DDL,
    REINFORCES_DDL,
    ELABORATES_DDL,
    // Memory ↔ code edges
    EDITS_DDL,
    ABOUT_FILE_DDL,
    ABOUT_SYMBOL_DDL,
    MENTIONS_SYMBOL_DDL,
    // code ↔ code edges
    IMPORTS_DDL,
    CALLS_DDL,
    DEFINES_DDL,
    CONTAINED_IN_DDL,
    // ── v2b Task 1.3 — control-plane rel tables ───────────────────────────
    ASSIGNED_TO_DDL,
    BLOCKED_BY_DDL,
    DELIVERED_BY_DDL,
    DEPENDS_ON_DDL,
    HAS_OUTCOME_DDL,
    PRODUCED_DDL,
    EDITED_RUN_DDL,
    HANDLED_DDL,
    PART_OF_RUN_DDL,
    HIT_DDL,
    INSTANTIATED_FROM_DDL,
    EXECUTED_BY_DDL,
    MEMBER_OF_DDL,
    LANDED_IN_DDL,
    ON_BRANCH_DDL,
    INCLUDES_COMMIT_DDL,
    DELIVERED_IN_DDL,
    POINTS_AT_DDL,
    SHADOW_OF_DDL,
    CONFORMS_TO_DDL,
    CHECKS_DDL,
    EVALUATED_DDL,
    DECIDED_ON_DDL,
    TRIGGERED_BY_DDL,
    RAN_AS_DDL,
    // ── Vector indexes — LAST ─────────────────────────────────────────────
    MEMORY_VECTOR_INDEX_DDL,
    ENTITY_VECTOR_INDEX_DDL,
    CODE_CHUNK_VECTOR_INDEX_DDL,
  ]
}

/** @deprecated use buildAllDDL(dims) */
export const ALL_DDL: string[] = buildAllDDL(1024)

export const SCHEMA_DDL_WITHOUT_INDEXES: string[] = ALL_DDL.filter(
  ddl => !ddl.includes('CREATE_VECTOR_INDEX')
)
