// v2a PR 1 Task 9 — kind validation lives here, not in the DB.
//
// PR 1 Task 1 dropped the CHECK constraint on memories.kind so we can add
// new kinds (file_patch, bash_trace, pre_compact_extract, session_summary,
// blocker_resolution, delegation_summary, identity, persona) without further
// table rebuilds. Validation moves into this module so write.ts applies a
// single canonical policy.
//
// PR 9.1 retired the per-kind char cap (`applyKindCap` / `KIND_CAPS`). v3
// L0 ingest is verbatim; the legacy v2a writer no longer truncates.

import { FulcrumError } from 'fulcrum-agent-core'

/** v2a kinds from §3.4 — standard, written by hooks or agents. */
const V2A_KINDS = [
  'file_patch',
  'tool_trace',
  'bash_trace',
  'pre_compact_extract',
  'session_summary',
  'task_outcome',
  'blocker_resolution',
  'delegation_summary',
  'decision',
  'identity',
  'persona',
  'summary',
] as const

/** Legacy MemoryKind values from the v1 schema CHECK enum — accepted for compat. */
const LEGACY_KINDS = [
  'fact',
  'symbol',
  'procedure',
  'error',
  'diff',
  'doc',
  'code',
  'task_goal',
  'task_decision',
  'task_failure',
  'reasoning_step',
  'lesson',
] as const

/** v2b kinds — graph node/edge kinds for control-plane + git entities. */
const V2B_KINDS = [
  'entity',
  'edge',
  'agent_card',
  'policy_event',
  'external_ref',
  'git_commit',
  'git_branch',
  'git_pr',
  'git_tag',
  'agent_adapter',
  'artifact_contract',
  'notification_event',
] as const

const ALLOWED_KINDS = new Set<string>([...V2A_KINDS, ...LEGACY_KINDS, ...V2B_KINDS])

export function isAllowedKind(kind: string): boolean {
  return ALLOWED_KINDS.has(kind)
}

/**
 * Throws FulcrumError('invalid_input') if `kind` is not in the allowed set.
 * Application-layer guard — call before writing to the memories table.
 */
export function validateKind(kind: string): void {
  if (!ALLOWED_KINDS.has(kind)) {
    throw new FulcrumError(`unknown memory kind: ${kind}`, 'invalid_input')
  }
}

export { V2A_KINDS, LEGACY_KINDS, V2B_KINDS, ALLOWED_KINDS }
