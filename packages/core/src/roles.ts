// packages/core/src/roles.ts
// Central role → capability lookup (H-11, spec §4 / §15 / §17).
// This replaces scattered string comparisons with a single source of truth
// for role boundaries: who can invoke teams, who can merge, who can edit files.
//
// NOTE (GAP-AGENTDEF-6): The `capabilities` array stored in agent_definitions
// (e.g. ["write_code","edit_files"]) is A2A metadata for external routing and
// capability advertisement.  Runtime enforcement of what an agent may do is
// governed solely by this module (roleCapabilities / canInvokeTeams / etc.) — it
// is intentionally hardcoded rather than DB-driven to keep the critical path
// free of runtime DB reads.  If a custom workspace role requires different
// enforcement semantics, deploy a custom policy rule via @fulcrum/policy.

import type { AgentRole } from './types.js'

export interface RoleCapabilities {
  /** L1 roles orchestrate; they MUST NOT write code, edit files, or merge. */
  is_l1: boolean
  /** Only L1 may create or invoke teams (§15). */
  can_invoke_teams: boolean
  /** Only integration_worker may perform merges (§17). */
  can_merge: boolean
  /** Direct file edits via Write/Edit/MultiEdit/NotebookEdit tool_use. */
  can_edit_files: boolean
  /** Direct code-writing authority. */
  can_write_code: boolean
}

export const L1_ROLES: ReadonlySet<AgentRole> = new Set<AgentRole>(['chief_of_staff'])

/** Roles that are pure reviewers — read-only, no direct code or file edits. */
const REVIEWER_ROLES: ReadonlySet<AgentRole> = new Set<AgentRole>([
  'code_reviewer',
  'security_reviewer',
  'architecture_reviewer',
])

export function isL1(role: AgentRole): boolean {
  return L1_ROLES.has(role)
}

export function roleCapabilities(role: AgentRole): RoleCapabilities {
  const is_l1 = isL1(role)
  const is_reviewer = REVIEWER_ROLES.has(role)
  return {
    is_l1,
    can_invoke_teams: is_l1,                     // §15 — L1 only
    can_merge: role === 'integration_worker',    // §17 — integration_worker only
    can_edit_files: !is_l1 && !is_reviewer,      // L2 non-reviewers may edit
    can_write_code: !is_l1 && !is_reviewer,      // same shape for code
  }
}

export function canInvokeTeams(role: AgentRole): boolean {
  return roleCapabilities(role).can_invoke_teams
}

export function canMerge(role: AgentRole): boolean {
  return roleCapabilities(role).can_merge
}

export function canWriteCode(role: AgentRole): boolean {
  return roleCapabilities(role).can_write_code
}

export function canEditFiles(role: AgentRole): boolean {
  return roleCapabilities(role).can_edit_files
}
