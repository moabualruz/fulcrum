# Round 2 Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the 6 small validated gaps (H-6, H-7, H-10, H-11, H-19, H-21) from `docs/gap-analysis/phase-2-validated.md`.

**Architecture:** Each task is scoped to 1–2 files and follows TDD. The big rocks (H-1..H-5 multi-agent execution layer) are deferred to their own plan — they need brainstorming first.

## Task ordering (sequential because of migration conflicts)

1. R2-1 (H-6) — MemoryScope CHECK adds `'task'`
2. R2-2 (H-19) — `projects.description` column + CRUD
3. R2-3 (H-10) — Worktree TTL cleanup in janitor
4. R2-4 (H-11) — Role capability lookup
5. R2-5 (H-21) — Hook event normalization unit tests per CLI
6. R2-6 (H-7) — Advisory lock spec §18.1 audit

---

## Task R2-1: MemoryScope CHECK constraint adds `'task'` (H-6)

**Files:**
- Modify: `packages/core/src/db/migrations.ts` — add `MIGRATION_023_MEMORY_SCOPE_TASK`
- Extend: `packages/core/src/tests/migrations.test.ts`

**Why**: Round 1 added `'task'` to the `MemoryScope` TS type but `MIGRATION_005`'s CHECK is still `CHECK(scope IN ('global','project','file'))`. Older DBs will reject `scope='task'` inserts; newer DBs that skip MIGRATION_005 rebuild accept anything. Rebuild the memories CHECK to include `'task'`.

**Steps**:
1. Test: insert `scope='task'` with `task_id` set → should succeed after migration
2. Test: insert `scope='bogus'` → should throw
3. Implement `MIGRATION_023_MEMORY_SCOPE_TASK`: `CREATE TABLE memories_new` (copy columns from current memories, new CHECK), `INSERT INTO memories_new SELECT *`, `DROP memories`, `RENAME memories_new → memories`, recreate indexes, record migration in `schema_migrations`
4. Run all core tests
5. Commit: `fix(memory): MIGRATION_023 extends memories.scope CHECK to include 'task' (H-6)`

---

## Task R2-2: Project.description column + CRUD (H-19)

**Files:**
- Modify: `packages/core/src/db/migrations.ts` — `MIGRATION_024_PROJECT_DESCRIPTION`
- Modify: `packages/core/src/projects.ts` — `Project.description`, `CreateProjectInput.description`, `UpdateProjectInput.description`
- Extend: `packages/core/src/tests/projects.test.ts`

**Steps**:
1. Test: createProject with `description='foo'` round-trips
2. Test: updateProject sets description
3. Test: projects without description default to null
4. Implement migration `ALTER TABLE projects ADD COLUMN description TEXT` (nullable, no default)
5. Update `Project` interface + `rowToProject` + `createProject` SQL + `updateProject` field setter
6. Run tests
7. Commit: `feat(projects): add description column + CRUD plumbing (H-19)`

---

## Task R2-3: Worktree TTL cleanup in janitor (H-10)

**Files:**
- Modify: `packages/worktrees/src/worktrees.ts` — add `cleanupAbandonedWorktrees({ttl_sec})`
- Extend: `packages/worktrees/src/tests/worktrees.test.ts`
- Modify: `packages/core/src/janitor.ts` — call cleanup inside the cycle

**Steps**:
1. Test: a worktree with `status='discarded'` and `updated_at` older than TTL is removed
2. Test: a worktree with `status='active'` even if old is NOT removed
3. Test: `cleanupAbandonedWorktrees` returns number of rows deleted
4. Implement — follows the pattern from `cleanupExpiredLocks` in `packages/core/src/locks.ts`
5. Wire into janitor cycle (same pattern as lock cleanup)
6. Run tests
7. Commit: `feat(worktrees): TTL cleanup in janitor cycle (H-10)`

---

## Task R2-4: Role capability lookup (H-11)

**Files:**
- Create: `packages/core/src/roles.ts` — `roleCapabilities(role)`, `L1_ROLES`, `L2_ROLES`, `isL1(role)`, `canInvokeTeams(role)`, `canMerge(role)`
- Create: `packages/core/src/tests/roles.test.ts`
- Modify: `packages/core/src/index.ts` — re-export
- Modify: `packages/policy/src/engine.ts` — replace `actor_role === 'chief_of_staff'` and `actor_role === 'integration_worker'` string comparisons with capability checks
- Modify: `packages/teams/src/teams.ts` — replace `caller_role !== 'chief_of_staff'` check with `canInvokeTeams(caller_role)`

**Shape**:
```typescript
// packages/core/src/roles.ts
export interface RoleCapabilities {
  is_l1: boolean
  can_invoke_teams: boolean
  can_merge: boolean
  can_edit_files: boolean
  can_write_code: boolean
}

export const L1_ROLES: ReadonlySet<AgentRole> = new Set(['chief_of_staff'])

export function roleCapabilities(role: AgentRole): RoleCapabilities {
  const is_l1 = L1_ROLES.has(role)
  return {
    is_l1,
    can_invoke_teams: is_l1, // only L1 may invoke teams
    can_merge: role === 'integration_worker',
    can_edit_files: !is_l1,
    can_write_code: !is_l1,
  }
}

export function isL1(role: AgentRole): boolean { return L1_ROLES.has(role) }
export function canInvokeTeams(role: AgentRole): boolean { return roleCapabilities(role).can_invoke_teams }
export function canMerge(role: AgentRole): boolean { return roleCapabilities(role).can_merge }
```

**Steps**:
1. Test: every L1 role returns `is_l1=true`, `can_invoke_teams=true`
2. Test: `integration_worker` returns `can_merge=true`, all others false
3. Test: `chief_of_staff` returns `can_write_code=false`, `can_edit_files=false`
4. Implement `roles.ts`
5. Refactor `policy/engine.ts SYSTEM_INVARIANTS` to use `isL1` / `canMerge` instead of string compare
6. Refactor `teams/teams.ts invokeTeam` to use `canInvokeTeams`
7. Run ALL tests — don't break policy or teams
8. Commit: `refactor(core,policy,teams): central role capability lookup (H-11)`

---

## Task R2-5: Hook event normalization unit tests per CLI (H-21)

**Files:**
- Create: `packages/cli/src/tests/hook-normalization.test.ts`

**What this tests**: the normalization logic inside `runHook` in `packages/cli/src/index.ts` should produce the same canonical shape regardless of whether the input is a Claude `PreToolUse` event (`tool_name`, `tool_input`, `session_id`), a Gemini `BeforeTool` event (`toolName`, `toolInput`, `conversationId`), or a PI event (`toolName`, `toolInput`, `sessionId`, `role`, `runId`).

Since `runHook` currently does the normalization inline and exits the process, the test needs one of two approaches:
- **A**: Extract the normalization logic into a pure function `normalizeHookEvent(cliName, event) → { toolName, toolInput, sessionId, agentRole }` and test that directly. This is the cleaner approach. Do this.
- **B**: Use `execa` / child_process to run `fulcrum hook <cli>` with stdin and check exit code. More fragile.

**Steps**:
1. Extract `normalizeHookEvent(cliName: 'claude'|'gemini'|'pi', event: Record<string,unknown>): { toolName: string; toolInput: Record<string,unknown>; sessionId: string; agentRole: string }` from `runHook` into a module-level function in `packages/cli/src/index.ts` (or a sibling file if the CLI is tree-shake-sensitive).
2. Test Claude: `{tool_name:'Read', tool_input:{path:'x'}, session_id:'abc'}` → `{toolName:'Read', toolInput:{path:'x'}, sessionId:'abc', agentRole:''}`
3. Test Gemini (both underscore and camelCase field variants): `{tool_name:'x', tool_input:{}, session_id:'g1'}` and `{toolName:'x', toolInput:{}, conversationId:'g1'}` → both normalize the same way
4. Test PI: `{toolName:'x', toolInput:{}, sessionId:'p1', role:'software_engineer', runId:'run_1'}` → `agentRole='software_engineer'`
5. Test empty event: returns defaults (empty strings + empty object)
6. Commit: `test(cli): hook event normalization unit tests for claude/gemini/pi (H-21)`

---

## Task R2-6: Advisory lock §18.1 audit (H-7)

**Files (possibly none — may be pure verification):**
- Read: `/home/mkh/workspace/pi-python-ref/pi_local_first_agent_os_spec.md` §18.1
- Maybe modify: `packages/core/src/locks.ts`, `packages/core/src/db/migrations.ts`, `packages/core/src/tests/locks.test.ts`

**Steps**:
1. `grep -n "^## *18\|^### *18\.1\|advisory lock\|shared lock" pi_local_first_agent_os_spec.md`
2. Read §18.1 in full.
3. If the spec says shared read locks exist: extend `AcquireLockInput` with `{ mode: 'shared'|'exclusive' }`, update the table with a `mode TEXT` column (new migration), update acquire logic (shared coexists with shared, exclusive blocks everything).
4. If the spec doesn't mention shared locks: add a one-sentence comment in `locks.ts` noting that the current implementation is exclusive-only and referencing the spec section. No code change needed.
5. If shared-lock support is added, write tests for shared-vs-shared, shared-vs-exclusive, exclusive-vs-shared.
6. Commit: `audit(locks): advisory lock §18.1 verification — {shared locks added | exclusive-only documented} (H-7)`

---

## Self-review checklist

1. **Spec coverage**: every Round 2 item (H-6, H-7, H-10, H-11, H-19, H-21) has a task. H-1..H-5 are explicitly deferred.
2. **No placeholders**: each task has concrete file paths and commit messages.
3. **Sequencing**: R2-1 and R2-2 both touch `migrations.ts` — do R2-1 first so R2-2 can add MIGRATION_024 cleanly. R2-4 touches three packages and must run before tests in any package assume the new shape.
4. **Branch safety**: all work stays on `main` per user instruction "merge back to main when done".

## Execution handoff

Use superpowers:subagent-driven-development. Dispatch a fresh subagent per task in the listed order. After all 6 tasks are done, run a **Round 3 fresh gap analysis** — new agents, no Round 2 context — to find what surfaced.
