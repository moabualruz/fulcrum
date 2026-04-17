// v2a PR 1 Task 9 — kind validation lives here, not in the DB.
//
// PR 1 Task 1 dropped the CHECK constraint on memories.kind so we can add
// new kinds (file_patch, bash_trace, pre_compact_extract, session_summary,
// blocker_resolution, delegation_summary, identity, persona) without further
// table rebuilds. Validation, char caps per §3.4, and the truncation marker
// move into this module so write.ts applies a single canonical policy.

import { FulcrumError } from '@moabualruz/fulcrum-core'

/** v2a kinds from §3.4 — Hermes-derived, written by hooks or agents. */
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

/**
 * Per-kind character cap in characters. Hermes convention: model-independent.
 * Content above the cap is truncated with `[…truncated N chars]`. Kinds not
 * listed have no cap.
 */
const KIND_CAPS: Record<string, number> = {
  file_patch: 800,
  tool_trace: 400,
  bash_trace: 400,
  pre_compact_extract: 1500,
  session_summary: 2200,
  task_outcome: 1500,
  blocker_resolution: 1500,
  delegation_summary: 800,
  decision: 800,
  identity: 1375,
  persona: 1375,
  summary: 2200,
}

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

/**
 * Returns `content` unchanged if under (or equal to) the per-kind cap, or a
 * truncated string with the `[…truncated N chars]` marker otherwise. Kinds
 * without a cap pass through unchanged.
 */
export function applyKindCap(kind: string, content: string): string {
  const cap = KIND_CAPS[kind]
  if (cap === undefined || content.length <= cap) return content
  const dropped = content.length - cap
  return `${content.slice(0, cap)} […truncated ${dropped} chars]`
}

export { V2A_KINDS, LEGACY_KINDS, V2B_KINDS, ALLOWED_KINDS, KIND_CAPS }
