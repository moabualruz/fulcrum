# Phase 2 Validated Gap List

Fresh review after Round 1 merged. Two parallel Explore agents compared
the Python reference (`/home/mkh/workspace/pi-python-ref`) against the
current TypeScript implementation. Findings validated against real code
and deduplicated here.

Agent A covered core data / models / schema / policy / ids / events /
memory.
Agent B covered workflows / teams / worktrees / worker / monitor / MCP /
hooks / analytics / sync / routing.

## Round 1 regression found and fixed

**R1-REG-1. HandoffMode enum values wrong, DB CHECK silently dropped** ✅
- **Evidence**: Round 1 Task 14 shipped `HandoffMode = 'sync' | 'async' | 'review' | 'escalate'`. Python spec uses `brief | contextual | artifact_first_brief | branched_session`. MIGRATION_008 originally enforced those four via CHECK constraint; MIGRATION_013 rebuilt the table without the CHECK, hiding the mismatch.
- **Fixed in commit**: `6590808` — `fix(handoffs): correct HandoffMode enum to match spec + restore DB CHECK`
- **Prevention**: Round 2 agent caught it within minutes. Suggests Round 1 should have cross-referenced types against DB CHECK constraints for every new enum.

---

## CRITICAL (blocks control plane completeness)

### H-1. Workflow step executor missing
- **Spec**: §12 / §13 — DAG runner with 15+ step types, per-step retries, timeouts, resumability
- **Evidence**: `packages/workflows/src/engine.ts` is 60 lines of helpers (`nextReadySteps`, `computeStatusCategory`, `initStepStates`). `workflows.ts startWorkflow / stepWorkflow / resumeWorkflow` are DB state machines that expect the CALLER to actually execute steps and report results. There's no `StepExecutor`, no retry loop, no timeout enforcement, no dispatch to per-step-type handlers.
- **Python**: `src/pi_agent_os/workflows/engine/runner.py` has the full runner (`WorkflowRunner.execute()` with retries, timeouts, state persistence, step dispatch); `engine/steps.py` has 15+ typed handlers (`_exec_create_task`, `_exec_invoke_team`, `_exec_spawn_agent`, `_exec_run_script`, `_exec_wait_for_task`, etc.)
- **Impact**: Workflows can't run autonomously. Every step transition requires an external orchestrator. Blocks the CoS + team-invoke loop that is the main use case.
- **Fix**: Needs its own plan (it's a 500+ line implementation). Deferred to a dedicated round.

### H-2. Worker / agent executor layer missing entirely
- **Spec**: §4 / §15 / §16 — worker spawns subordinate agents (Claude/Gemini/PI), delivers handoff packets, polls lifecycle
- **Evidence**: No `packages/worker/` package exists. `startAgentRun` in core only writes a DB row — it doesn't spawn any subprocess, resolve a model spec, or deliver a handoff.
- **Python**: `src/pi_agent_os/worker/{lifecycle,cli_chat_adapter,pi_adapter,pi_rpc_bridge,cos_context}.py` implements the full execution layer.
- **Impact**: Multi-agent workflows can't actually run. The control plane tracks what SHOULD happen but can't cause it. Depends on H-1 (the runner is what calls into the worker).
- **Fix**: Own plan. Likely consumes H-1's `spawn_agent` step type.

### H-3. Worktree allocator has no git integration
- **Spec**: §18 — `git worktree add <path> -b <branch>` per allocation
- **Evidence**: `packages/worktrees/src/worktrees.ts allocateWorktree` only writes a DB row. The `path` is a parameter, not computed. No validation that the repo is git, no branch creation, no sequential fallback for non-git projects (§18.7).
- **Python**: `src/pi_agent_os/worktrees/allocator.py` runs `subprocess.run(['git', 'worktree', 'add', path, '-b', branch])` etc.
- **Impact**: `allocateWorktree` is a stub — the caller has to do the real git work out of band, defeating the whole point.
- **Fix**: Own plan.

### H-4. Merge queue doesn't actually merge
- **Spec**: §18 — integration worker dequeues, runs artifact gates (review + test), executes `git merge --no-ff`, handles conflicts, escalates on failure
- **Evidence**: `packages/worktrees/src/worktrees.ts enqueueMerge` is a no-op. `processMergeQueue` just flips status to `'merged'` in the DB. No `git merge`, no conflict detection, no gates.
- **Python**: `src/pi_agent_os/worktrees/{merge_queue,integration_worker}.py` has real merge logic, conflict diffs, escalation routing.
- **Impact**: The integration_worker role has nothing to execute. Merges can't happen.
- **Fix**: Own plan. Depends on H-3 (git subprocess helper).

### H-5. Per-step workflow handlers not implemented
- **Evidence**: No `packages/workflows/src/executor.ts` or equivalent. No handlers for `create_task`, `create_issue`, `write_artifact`, `invoke_team`, `spawn_agent`, `run_script`, `wait_for_task`, `wait_for_review`, `wait_for_artifact`, `call_mcp_tool`, `branch`, `loop`, `map`, `halt`, `escalate`.
- **Python**: `src/pi_agent_os/workflows/engine/steps.py` (34–218).
- **Impact**: Subset of H-1. Same deferral.
- **Fix**: Part of the H-1 plan.

### H-6. MemoryScope CHECK constraint missing `'task'`
- **Evidence**: `MIGRATION_005` CHECK is `CHECK(scope IN ('global','project','file'))`. TS types added `'task'` (G-4 in Round 1) but the migration wasn't updated — so writing a `scope='task'` row into a DB that ran MIGRATION_005 fails at the DB layer on older DBs, or bypasses the CHECK on newer ones (depending on whether MIGRATION_005 ran before or after Round 1's MIGRATION_020).
- **Impact**: `scope='task'` rows may or may not persist depending on schema version. Silent data loss possible.
- **Fix**: New migration `MIGRATION_023_MEMORY_SCOPE_TASK` that rebuilds the CHECK to include `'task'`. Small — not its own plan, goes in Round 2 task list.

---

## IMPORTANT

### H-7. Advisory locks doc drift — docstring in locks.ts says single-holder per resource, spec §18.1 implies shared read locks and exclusive write locks
- **Evidence**: `packages/core/src/locks.ts` implements exclusive-only. Spec §18.1 doesn't explicitly distinguish. May be fine as-is — flag for verification.
- **Fix**: Read §18.1 carefully. If shared locks are required, extend API; otherwise document the decision and move on.

### H-8. Run event journal helpers only in TS — no Python parity
- **Evidence**: Round 1 Task 10 added `appendRunEvent` in TS. Python `AgentRun` model has no `events` field.
- **Impact**: Python control plane reading a TS-written agent_runs row loses the events column. Only matters if we ever run Python against TS-written DBs, which is probably never. **Reverse gap** — skip.

### H-9. Merge-queue / review-queue monitor endpoints missing
- **Spec**: §19.11 operator visibility
- **Evidence**: `packages/monitor/src/server.ts` has `/merge-queue` (line 174) and `/review-queue` (line 188) from earlier work — Agent B missed them. **False gap** — skip.

### H-10. Worktree cleanup (janitor) not implemented
- **Spec**: §18.6 — abandoned worktrees TTL-reaped
- **Evidence**: No `cleanupAbandonedWorktrees` in `packages/worktrees/src/`. Janitor doesn't mention worktrees.
- **Fix**: Small module + janitor hook. In Round 2 task list.

### H-11. Role enforcement is string comparison, not profile lookup
- **Spec**: §4 / §15 — roles carry capability flags (`can_invoke_teams`, `can_merge`, etc.)
- **Evidence**: `packages/teams/src/teams.ts:71` checks `caller_role !== 'chief_of_staff'` directly. Policy SYSTEM_INVARIANTS do the same.
- **Impact**: If a role string is misspelled or mapped via PI profile, checks silently pass or fail. Fragile.
- **Fix**: Central `roleCapabilities(role)` → `{ can_invoke_teams, can_merge, can_edit_files, ... }`. Used by policy engine and team-invocation checks. Mid-size refactor.

### H-12. MemoryScope 'task' validation only in TS
- Same as H-8 — reverse gap. Skip.

### H-13. Memory `freshness` field not in Python model
- Reverse gap. Skip.

### H-14. `from_agent_id`/`to_agent_id` optionality — Python requires them, TS allows null
- **Evidence**: TS is more permissive. Spec doesn't require them (a handoff can target a role, not a specific agent).
- **Impact**: None for TS. Python model is wrong. Reverse gap — skip.

### H-15. Sync `conflict_state` not typed in Python
- Reverse gap. Skip.

### H-16. Agent run `output_summary` vs `summary` naming
- **Evidence**: TS uses `output_summary`. Python uses `summary` inside `WorkerResult`.
- **Impact**: Interop only (which isn't a TS concern). Skip.

### H-17. Analytics / graph tables TS-only
- **Evidence**: `analytics_*` and `graph_*` tables exist in TS migrations. Python doesn't have them.
- **Impact**: Reverse gap — TS is ahead. Skip.

---

## MINOR

### H-18. `agent_state_projection` table exists only in TS
- Reverse gap. Skip.

### H-19. Project.description field in Python, not in TS
- **Evidence**: Python `project.py` has `description: str = ""`. TS `projects` table has no description column.
- **Impact**: Data model completeness. Low urgency.
- **Fix**: Add `description TEXT` to projects in a small migration. Round 2 task list.

### H-20. Workflow registry doesn't validate step_type enum at load time
- **Fix**: Add zod schema at parse time. Small — goes into Round 2 task list if the workflow runner plan wants it, otherwise skip.

### H-21. Hook event normalization not unit-tested per CLI (claude / gemini / pi)
- **Fix**: Add one unit test per event shape — small Round 2 task.

---

## False gaps (agent reports rejected on validation)

1. **`H-9` merge-queue/review-queue endpoints missing** — they exist at `server.ts:174` and `:188`.
2. **`H-12` `HandoffMode='sync'|'async'|'review'|'escalate'`** — already fixed as the Round 1 regression R1-REG-1 above.
3. **`H-11` MemoryKind count** — 13 in both TS and Python; prior G-16 audit already closed this.
4. **`H-6` `MemoryScope` CHECK drift** — status: real gap, promoted to CRITICAL above (not a false gap).
5. **Agent A claim "Python MemoryFacade doesn't validate scope=task"** — Python validation isn't our problem. Reverse gap.

---

## Round 2 scope

Real gaps that fit a tight Round 2 plan (no deferrable big rocks):

| ID | Title | Size |
|---|---|---|
| R2-1 | **MemoryScope CHECK constraint extended to `'task'`** (H-6) | S |
| R2-2 | **Worktree cleanup in janitor** (H-10) — `cleanupAbandonedWorktrees` + TTL | M |
| R2-3 | **Role capability lookup** (H-11) — central `roleCapabilities()` used by policy + teams | M |
| R2-4 | **Project.description column + CRUD plumbing** (H-19) | S |
| R2-5 | **Hook event normalization unit tests** (H-21) — one test per CLI | S |
| R2-6 | **Advisory lock spec §18.1 verification** (H-7) — read spec, document decision, extend API if needed | S |

Deferred to their own dedicated plans (H-1..H-5):
- **Workflow step executor** (H-1, H-5)
- **Worker / agent executor layer** (H-2)
- **Worktree git subprocess integration** (H-3)
- **Merge queue + integration worker execution** (H-4)

These four together constitute the "multi-agent execution" layer. They should be brainstormed and planned together in a dedicated round because they interlock (runner calls worker, worker claims worktree, integration worker uses merge queue, all emit telemetry spans that the runner stitches together).

---

## Takeaways from Round 2

1. **Fresh reviews catch regressions invisible to the round that shipped them.** R1-REG-1 only surfaced because a new agent read the DB schema and the type file side-by-side without any context about what Task 14 claimed to do. Keep the "fresh subagent per round" discipline.

2. **Deferred items stay deferred.** The 5 CRITICAL items (H-1..H-5) were all in D-1..D-4 from Round 1's "deferred big rocks". They haven't grown any smaller. They need their own rounds.

3. **Sanity-check enum values against DB CHECK constraints before shipping types.** Round 1 Task 14 would not have regressed if the implementer had read the migration for `handoffs` and confirmed the CHECK values before changing the type.

4. **Round 2 is small and tight**. 6 tasks, all under a day total. Execute, then run Round 3 to find whatever surfaces next.
