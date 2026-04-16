# Phase 3 Validated Gap List

Round 3 fresh review (two parallel agents, no Round 1/2 context) found
6 new items after dedup and validation. Most are **the same failure
pattern as the Round 1→2 HandoffMode regression**: table-rebuild
migrations silently drop CHECK constraints without replacing them.

This reveals a systemic issue worth a sweep audit, not just one-off
fixes.

---

## CRITICAL

### J-1. `packages/memory/src/write.ts` generates memory_id without `mem_` prefix
- **Spec**: §6.1 typed prefixed IDs for all first-class objects
- **Evidence**: `packages/memory/src/write.ts:47` has `const memory_id = ulid()` instead of `newId('memory')`. Memories are persisted with bare ULIDs like `01HX...` instead of `mem_01HX...`.
- **Impact**: Violates §6.1. Any prefix-based dispatch / validation (e.g., `id.startsWith('mem_')`) silently fails. Memory IDs don't match the shape of every other ID type in the system.
- **Fix**: Replace `const memory_id = ulid()` with `const memory_id = newId('memory')`. Add a test that `writeMemory` returns `memory_id.startsWith('mem_')`.

---

## IMPORTANT

### J-2. `tasks.status` CHECK constraint dropped and never replaced
- **Evidence**: `MIGRATION_001` created `tasks.status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','in_progress','completed','blocked'))`. `MIGRATION_002` rebuilt the table with comment `"full table recreation to remove restrictive CHECK constraint on status"` — correctly, because the original enum was wrong. But no new CHECK was added, so `tasks.status` now accepts any string.
- **Impact**: Same class of bug as the HandoffMode regression R1-REG-1. Silent data corruption possible. `TaskStatus` type in `types.ts` is a 4- or 8-value union; the DB accepts garbage.
- **Fix**: New migration `MIGRATION_025_TASKS_STATUS_CHECK` that rebuilds the tasks table with `CHECK(status IN (...current TaskStatus values...))`. Follow the MIGRATION_022 rebuild pattern used for the handoffs fix.

### J-3. `agent_runs.role` CHECK constraint dropped and never replaced
- **Evidence**: `MIGRATION_001` had `CHECK(role IN ('chief_of_staff','implementer','tester','reviewer','researcher','planner'))` — 6 values, wildly out of date vs the current 24-value `AgentRole` enum. `MIGRATION_002` rebuilt the table dropping the CHECK. No new CHECK was added.
- **Impact**: Same as J-2. An `agent_runs.role` column accepts any string, so typos or drift between type and DB go undetected.
- **Fix**: Same migration as J-2 can handle both: rebuild `agent_runs` with `CHECK(role IN (...all 24 AgentRole values...))`.

### J-4. `MemoryKind` type drift between `@moabualruz/fulcrum-core` and `@moabualruz/fulcrum-memory`
- **Evidence**:
  - `packages/core/src/types.ts:49-51` — 13 values: `fact, summary, symbol, decision, procedure, error, diff, doc, code, task_goal, task_decision, task_failure, task_outcome`
  - `packages/memory/src/types.ts:5-9` — 16 values: the 13 above + `tool_trace, reasoning_step, lesson`
- **Impact**: The two packages have different opinions about what a valid memory kind is. A memory package caller can use `'tool_trace'` and have it compile and pass validation there, but when the value round-trips through core (e.g., via `recallMemory` return types), TypeScript sees a type mismatch. Also: the DB `CHECK` on `memories.kind` (if any — verify in this task) only knows about one of the two sets.
- **Fix**:
  - Decide: should the memory package's 3 extra values be canonical?
  - If yes: add `tool_trace | reasoning_step | lesson` to `packages/core/src/types.ts MemoryKind` and update the CHECK in `MIGRATION_005` (or add a new migration if MIGRATION_005 already ran elsewhere) via a CHECK-rebuild migration.
  - If no: remove them from `packages/memory/src/types.ts` and re-export from core.
  - Recommendation: **promote** the 3 memory-package values to core — the memory package added them for a reason and they're consistent with spec §10.5's "suggested" framing.

### J-5. Systemic: migration rebuilds drop CHECK constraints
- **Evidence**: Three instances found so far —
  - MIGRATION_002 dropped the `tasks.status` CHECK (J-2)
  - MIGRATION_002 dropped the `agent_runs.role` CHECK (J-3)
  - MIGRATION_013 dropped the `handoffs.handoff_mode` CHECK (fixed as R1-REG-1 in commit `6590808` with MIGRATION_022)
- **Pattern**: When a migration rebuilds a table to update a CHECK (usually because the original enum values were wrong), the rebuild drops the constraint entirely instead of replacing it with the correct version. This happened at least 3 times.
- **Fix (meta)**: Add a lightweight test that iterates every enum column we care about (`tasks.status`, `agent_runs.role`, `agent_runs.status`, `memories.kind`, `memories.scope`, `handoffs.handoff_mode`, `handoffs.status`, `projects.type`, `projects.status`, `projects.write_mode`, `trace_events.status`, `advisory_locks`... etc.) and asserts that each column's CHECK constraint matches the current TS type union. This is a guard against future rebuild drops. Goes in Round 3 as **R3-4**.

---

## DEFERRED

### J-6. CLI coverage gap — 10 Python subcommands missing from TS
- **Evidence**: Python has `pi agent`, `pi board`, `pi epic`, `pi issue`, `pi queue`, `pi sync`, `pi task`, `pi team`, `pi workflow`, and `pi monitor` as a subcommand. TS has only `memory`, `serve`, `hook`, `workspaces`, `projects`.
- **Impact**: Operators can't inspect or manipulate core domain objects from the CLI. All work has to go through the monitor HTTP API or direct DB.
- **Why deferred**: Each missing command is a non-trivial implementation (input parsing, output formatting, validation, tests) — roughly 50-100 lines each × 10 commands. Plus design decisions about which flags to support, table output vs JSON, filter semantics. Needs its own plan + review cycle, not a single round.
- **Fix**: Dedicated "CLI coverage" plan. Should wait until after the multi-agent execution layer (H-1..H-5) because the workflow / team / queue commands only make sense once those subsystems exist.

### J-7. Telemetry OTel exporter missing
- **Evidence**: Python `telemetry/spans.py` uses `opentelemetry.trace` with `gen_ai.*` semantic conventions and can export to any OTLP collector. TS `packages/core/src/telemetry/spans.ts` persists spans to the local `trace_events` table — no external export.
- **Why deferred**: Local traces work for dev/debugging and single-user deployments. OTel export is "nice to have" and affects zero TS control-plane behavior. Revisit when there's a clear target (Datadog / Honeycomb / Jaeger) to export to.
- **Fix**: Own plan.

### Big rocks from earlier rounds (still deferred)
- H-1 Workflow step executor missing
- H-2 Worker / agent executor layer missing entirely
- H-3 Worktree allocator lacks git subprocess integration
- H-4 Merge queue doesn't actually merge
- H-5 Per-step workflow handlers not implemented

All five interlock into the "multi-agent execution layer" plan that needs brainstorming first.

---

## Round 2 regressions

**None detected.** All 6 Round 2 fixes (H-6..H-7, H-10, H-11, H-19, H-21) still in place. Verified by both parallel agents.

---

## False gaps (rejected)

1. **"Weighted recall ranking not wired"** (Agent A P3-005) — `packages/core/src/memory.ts:6` imports `MEMORY_RANK_WEIGHTS` and uses it in `hybridScore` at lines 35–47. Round 1 Task 12 is correct and present.
2. **"Path versioning difference /api/v1/ vs flat"** (Agent B P3-002) — intentional design.
3. **"`/workspaces` / `/projects` endpoints missing"** (Agent B P3-003) — they exist at `server.ts:399-415`.
4. **"MCP tool parity"** (Agent B P3-012) — all 13 present.
5. **"Teams concurrency caps"** (Agent B P3-020) — parity confirmed.
6. **All reverse gaps** (P3-007 through P3-010 from Agent A, P3-005 from Agent B) — Python is behind TS. Not our problem.

---

## Round 3 scope

Tight, focused. All four items are verified real gaps with scoped fixes:

| ID | Title | Size |
|---|---|---|
| R3-1 | **Memory ID prefix fix** (J-1) — one-line code change + test | XS |
| R3-2 | **MIGRATION_025 restores CHECK on tasks.status + agent_runs.role** (J-2, J-3) | M |
| R3-3 | **`MemoryKind` alignment** (J-4) — promote memory package values into core + CHECK update | S |
| R3-4 | **CHECK constraint drift guard test** (J-5) — enum-to-CHECK parity test suite | S |

**Deferred with rationale** (J-6, J-7, H-1..H-5) — each needs its own plan.

## Success criteria for Round 3

- All 4 tasks land green, no regressions in 889 existing tests
- The CHECK-drift guard test in R3-4 catches any future instance of the R1-REG-1 / J-2 / J-3 pattern
- Round 4 fresh review finds nothing from the current gap list that resurfaces
