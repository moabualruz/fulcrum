// packages/memory/src/types.ts

export type MemoryScope = 'global' | 'project' | 'file'

export type MemoryKind =
  | 'fact' | 'summary' | 'symbol' | 'decision' | 'procedure'
  | 'error' | 'diff' | 'doc' | 'code'
  | 'task_goal' | 'task_decision' | 'task_failure' | 'task_outcome'
  | 'tool_trace' | 'reasoning_step' | 'lesson'

export type RecallMode = 'compact' | 'total_ranked' | 'total_timeline' | 'total_sourcemap'

export interface WriteMemoryInput {
  workspace_id: string
  project_id: string | null           // null = global scope
  scope: MemoryScope
  kind: MemoryKind
  title: string
  summary: string
  content: string                     // raw content; also used as canonical_text unless overridden
  canonical_text?: string             // optional structured canonical form; defaults to content if omitted
  tags?: string[]
  confidence?: number                 // 0–1, default 1.0
  freshness?: number                  // 0–1, default 1.0; new memories start fresh
  importance?: number                 // 0–1, default 0.5
  file_path?: string | null
  symbol_path?: string | null
  entities?: string[]
  event_time?: string | null
  task_id?: string | null
  issue_id?: string | null
  artifact_id?: string | null
  provenance_refs?: string[]
  embedding?: Float32Array
  skipVaultWrite?: boolean   // internal flag for rebuild path — skips L0 write
}

export interface RecallMemoryInput {
  workspace_id: string
  project_id?: string | null
  query: string
  mode?: RecallMode                   // default: 'compact'
  limit?: number                      // default: 8 for compact, 20 for others
  scope?: MemoryScope
  kind?: MemoryKind
  file_path?: string
}

/** Compact recall result — minimal fields only */
export interface CompactMemory {
  memory_id: string
  title: string
  summary: string
  scope: MemoryScope
  kind: MemoryKind
  file_path: string | null
  confidence: number
}

/** Full memory record returned by total_* modes */
export interface FullMemory {
  memory_id: string
  scope: MemoryScope
  kind: MemoryKind
  workspace_id: string
  project_id: string | null
  file_path: string | null
  symbol_path: string | null
  title: string
  summary: string
  canonical_text: string | null
  tags: string[]
  entities: string[]
  confidence: number
  freshness: number
  importance: number
  access_count: number
  event_time: string | null
  content_hash: string | null
  task_id: string | null
  issue_id: string | null
  artifact_id: string | null
  provenance_refs: string[]
  created_at: string
  updated_at: string
  last_accessed_at: string
}

export interface MemoryEntity {
  memory_id: string
  entity_type: string
  entity_id: string
  relation_type: string
}

export interface LinkMemoryToEntityInput {
  memory_id: string
  entity_type: string
  entity_id: string
  relation_type?: string   // default: 'subject_of'
}

export interface CodeChunk {
  chunk_id: string
  workspace_id: string
  project_id: string
  file_path: string
  language: string | null
  chunk_strategy: 'syntax' | 'semantic' | 'token'
  source_type: 'code' | 'prose'
  content: string
  start_line: number | null
  end_line: number | null
  symbol_path: string | null
  content_hash: string | null
  indexed_at: string
}

export interface IngestFileInput {
  workspace_id: string
  project_id: string
  file_path: string
  content: string
  language?: string
}

export interface IngestResult {
  chunks_created: number
  memories_created: number
}

export interface IngestProjectInput {
  workspace_id: string
  project_id: string
  root_path: string
}

// ── Vault (L0) types ─────────────────────────────────────────────────────────

export interface MemoryFileFrontmatter {
  id: string
  schema: 'fulcrum.memory/v1'
  kind: MemoryKind
  scope: MemoryScope
  workspace_id: string
  project_id?: string | null
  file_path?: string | null
  symbol_path?: string | null
  title: string
  summary?: string
  tags?: string[]
  confidence?: number
  importance?: number
  freshness?: number
  created_at?: string
  updated_at?: string
  event_time?: string | null
  task_id?: string | null
  issue_id?: string | null
  artifact_id?: string | null
  entities?: string[]
  provenance_refs?: string[]
  content_hash?: string | null
  source?: string
  author?: string
}

export type CuratedKind = 'decision' | 'fact' | 'lesson' | 'summary' | 'task_outcome' | 'task_decision' | 'error' | 'doc'
export type OperationalKind = 'symbol' | 'diff' | 'code' | 'procedure' | 'task_goal' | 'task_failure' | 'tool_trace' | 'reasoning_step'

export const CURATED_KINDS: ReadonlySet<MemoryKind> = new Set<MemoryKind>([
  'decision', 'fact', 'lesson', 'summary', 'task_outcome', 'task_decision', 'error', 'doc',
])

export const OPERATIONAL_KINDS: ReadonlySet<MemoryKind> = new Set<MemoryKind>([
  'symbol', 'diff', 'code', 'procedure', 'task_goal', 'task_failure', 'tool_trace', 'reasoning_step',
])
