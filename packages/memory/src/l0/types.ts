// packages/memory/src/l0/types.ts
//
// Memory v3 L0 raw-source type definitions. PR 0 unit 0.4 — types only, no
// runtime logic. Consumers land in PR 1 (ingestRawSource) and later.
//
// L0 holds verbatim raw dumps. Zero truncation, zero normalization. The
// frontmatter is minimal — just enough metadata for ingestion, retrieval, and
// audit. Body is the captured material, untouched.
//
// See docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md §L0 + §L0
// raw-source frontmatter for the authoritative spec.

/**
 * Source kinds accepted at L0. The DB-layer `l0_sources.source_type` has no
 * CHECK constraint (per v2a precedent — validation lives in app code); this
 * const tuple is the single authoritative list for runtime validation and
 * for deriving the `L0SourceType` union.
 *
 * `correction` is special: it is written by the `mark-wrong` workflow (see
 * plan §Guided templates + L0 traceability) when a user or agent flags an
 * L1 page as wrong. The correction L0 entry then triggers curator re-run.
 */
export const L0_SOURCE_TYPES = [
  'bash_trace',
  'tool_trace',
  'file_patch',
  'session_transcript',
  'prompt_attachment',
  'web_capture',
  'edit_diff',
  'correction',
] as const

export type L0SourceType = (typeof L0_SOURCE_TYPES)[number]

/**
 * YAML frontmatter serialized to the top of every `${vault}/raw/<type>/<yyyy>/<mm>/<dd>/<ULID>.md` file.
 *
 * - `id` is the ULID that also names the file on disk.
 * - `schema` is the frontmatter version discriminator (current: `fulcrum.source/v3`).
 * - `session_id`, `workspace_id`, `project_id`, `cwd` are captured at ingest
 *   time and are the minimum context needed to resolve a source back to the
 *   agent run that produced it.
 * - `content_hash` is SHA-256 (hex) of the body.
 * - `size_bytes` is the byte length of the body (pre-frontmatter).
 */
export interface L0Frontmatter {
  id: string
  schema: 'fulcrum.source/v3'
  source_type: L0SourceType
  session_id: string | null
  workspace_id: string
  project_id: string | null
  cwd: string | null
  created_at: string
  content_hash: string
  size_bytes: number
}

/**
 * In-memory representation of a written L0 file. Returned by `ingestRawSource`
 * (PR 1 unit 1.1) after the file hits disk and the `l0_sources` row is
 * inserted.
 *
 * `vault_path` is relative to the vault root (e.g. `raw/bash_trace/2026/04/18/01SRC_A.md`) —
 * matches the `l0_sources.vault_path` column exactly.
 */
export interface L0File {
  frontmatter: L0Frontmatter
  body: string
  vault_path: string
}

/**
 * Optional per-call overrides for `ingestRawSource`. When omitted, each field
 * is resolved from the ambient context (workspace/project from cwd,
 * session_id from the active agent run, created_at from wall clock).
 */
export interface L0IngestMeta {
  session_id?: string | null
  workspace_id?: string
  project_id?: string | null
  cwd?: string | null
  created_at?: string
}

/**
 * The `ingestRawSource(input)` argument shape. `body` is taken verbatim — no
 * sanitization, truncation, or canonical_text tokenization at this layer.
 */
export interface L0IngestInput {
  source_type: L0SourceType
  body: string
  meta?: L0IngestMeta
}

/**
 * Row shape for the `l0_sources` table (see `schema.ts` 101_memory_v3_lifecycle).
 * Mirrors the DB column names 1:1 for use in query results.
 */
export interface L0SourceRow {
  source_id: string
  source_type: L0SourceType
  session_id: string | null
  workspace_id: string
  project_id: string | null
  cwd: string | null
  vault_path: string
  content_hash: string
  size_bytes: number
  created_at: string
}
