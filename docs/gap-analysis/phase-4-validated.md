# Phase 4 Validated Gap List

Fresh review after Round 3 merged. Two parallel agents with zero prior
context compared the Python reference against the current TypeScript
implementation. Findings validated against actual code below.

**Key insight**: the R3-1 memory_id fix was incomplete. It fixed
`packages/memory/src/write.ts` but missed `packages/core/src/cos-parser.ts`
which has the exact same bug plus an INSERT column drift. The new
CHECK-drift guard caught 4 missing CHECK constraints — good. But there's
no guard for "bare ulid() calls generating first-class IDs", so this
family of bugs can still surface in new files.

---

## CRITICAL

### K-1. `cos-parser.ts` generates memory_id via `'mem_' + ulid()` instead of `newId('memory')`
- **Evidence**: `packages/core/src/cos-parser.ts:110` — `const memory_id = 'mem_' + ulid()`. The import `import { ulid } from 'ulid'` lives at line 2. No `newId` import.
- **Impact**: Same bug class as R3-1 (fixed in `write.ts`) but in a different file. Every CoS response that writes memory bypasses `newId` and hardcodes the prefix. If the prefix ever changes, this path drifts silently.
- **Fix**: Replace with `import { newId } from './ids.js'` + `const memory_id = newId('memory')`. Remove the now-unused `ulid` import if nothing else in the file uses it.

### K-2. `NormalizedHookEvent` drops PI `runId` field
- **Evidence**: `packages/cli/src/index.ts:141-145` — `NormalizedHookEvent` has `toolName`, `toolInput`, `sessionId`, `agentRole` but no `runId`. Line 173 reads `event['role']` for `agentRole` but never reads `event['runId']` / `event['run_id']`. The existing hook-normalization test at `packages/cli/src/tests/hook-normalization.test.ts` passes `runId: 'run_xyz'` as input but **does not assert it round-trips** — so the drop was invisible.
- **Impact**: Every PI tool-call hook loses the run_id it carries. Policy events logged via `emitEvent` lose the association between the tool call and the agent run. Telemetry can't thread PI hook activity into span lineage.
- **Fix**: Add `runId: string` to `NormalizedHookEvent`. In the `pi` branch (line 173), capture `runId = (event['runId'] ?? event['run_id']) as string ?? ''`. Update `runHook` to destructure `runId` too and pass it into `emitEvent`'s actor_id or payload. Add a test assertion that `runId` round-trips for PI events.

---

## IMPORTANT

### K-3. `cos-parser.ts` INSERT drifts from current `memories` schema
- **Evidence**: `packages/core/src/cos-parser.ts:119-144` — the INSERT lists 22 columns, but the `memories` table has additional columns added by later migrations:
  - `freshness` (MIGRATION_012) — nullable, DEFAULT 1.0, so NULL rows fall back to the default. Ranking code depends on this; explicit passing is safer.
  - `importance` (verify via `PRAGMA table_info(memories)`) — may or may not have a default.
  - `file_path` (MIGRATION_005) — nullable; fine to leave out, but the test for `scope='file'` memories would need it set.
  - `symbol_path` (MIGRATION_005) — same.
  - The bind drift: the code passes 17 values for 17 `?` placeholders, but the author clearly intended position 13 to be `embedding` (there's a loose `JSON.stringify([])` on line 139 that ends up bound to `provenance_refs` instead because the SQL hardcodes embedding=NULL). Works by accident.
- **Fix**: Replace the INSERT with a call into the canonical `writeMemory` function from `packages/core/src/memory.ts`, which already handles schema drift correctly. OR hand-roll a new INSERT that lists every current column explicitly and matches the bind order. Prefer the first option — DRY and prevents future drift.

### K-4. `packages/policy/src/audit.ts` uses custom `'pevt_' + ulid()` prefix
- **Evidence**: `packages/policy/src/audit.ts:26` — `const evt_id = 'pevt_' + ulid()`. The import `import { ulid } from 'ulid'` lives at line 2. The `newId` dispatcher doesn't have a `policy_event` prefix registered.
- **Impact**: Policy audit events don't follow the centralized ID scheme. If the prefix system ever changes (new length, alphabet, validation), this path drifts. Also the `'pevt_'` prefix isn't documented anywhere outside this one file.
- **Fix**: Either:
  - **(a)** Add `policy_event: 'pevt_'` to `PREFIXES` in `packages/core/src/ids.ts` and change line 26 to `newId('policy_event')`, OR
  - **(b)** Drop the custom prefix and use `newId('event')` like the rest of the event system (grep `packages/core/src/events.ts` to confirm the generic event prefix exists).
  - **Recommendation**: (a) — policy events ARE a distinct event type with their own table, so a distinct prefix is fine; we just want it in the centralized registry.

### K-5. Telemetry spans have no production call sites
- **Evidence**: Agent B noted: `startSpan` / `endSpan` / `getTrace` in `packages/core/src/telemetry/spans.ts` are exported, tested, and green. But `grep -rn "startSpan\b" packages/ --include="*.ts" | grep -v tests | grep -v telemetry/spans.ts` returns nothing. The scaffold is unused outside of its own tests.
- **Impact**: Not a bug per se — the scaffold exists for future use. But it's a "ready to use" feature that nobody is using, which means nobody has pressure-tested it. When H-1 (workflow runner) lands, wiring spans is the right time to pressure-test.
- **Fix / defer**: Defer to the H-1 workflow runner plan. Spans will instrument workflow step execution, CoS context building, janitor cycles, and monitor request handlers as part of that work. Add a note in the H-1 brainstorm doc that spans MUST be wired there.

---

## MINOR

### K-6. `HandoffStatus` / `HandoffMode` not exported as standalone types
- **Evidence**: `packages/core/src/types.ts:277` has `status: 'pending' | 'claimed' | 'completed' | 'cancelled'` inline inside the `HandoffPacket` interface. No `export type HandoffStatus` at module level. Same for `HandoffMode` pre-R1 — that one is now exported, but `HandoffStatus` is still inline.
- **Impact**: External code that wants to type a variable as `HandoffStatus` has to re-declare the union or import `HandoffPacket['status']`. Discoverability / consistency.
- **Fix**: Export `HandoffStatus` as a standalone type alias. Also do the same for any other literal union that's currently inline (audit the types file).

### K-7. `check-constraints.test.ts` doesn't parse the `AgentRunStatus` type from types.ts
- **Evidence**: The guard test hard-codes expected values for each column. If `types.ts` adds a new value (e.g., Round 3 added `'stale'` to `AgentRunStatus`) and the migration is also updated, but the test's hardcoded array isn't updated, the test passes while drift continues. The test is only as good as the hardcoded list.
- **Impact**: Minor — the test is already catching the main issue. But it's a fragile stopgap.
- **Fix**: Harder than it looks — TypeScript type information isn't available at runtime. One option: generate the expected lists from the types at build time via a codegen script. Another: derive them from the `newId`/`validRoles`/etc. runtime arrays if those exist. Defer unless another drift slips through.

---

## Round 3 regressions

**None detected.** Both agents independently confirmed every Round 3 fix still in place:
- `memory_id` via `newId('memory')` in `write.ts` ✓
- MIGRATION_025 / 027 CHECKs on status/role columns ✓
- MemoryKind aligned to 16 values ✓
- Check-constraints guard suite catches new drift ✓
- `AgentRunStatus` type includes `'stale'` ✓

---

## False gaps

1. **Agent A P4-007 "MemoryScope missing 'task' in Python reference"** — reverse gap. Python ref is stale, TS is correct per spec.
2. **Agent B P4-003 "CLI coverage gap"** — already deferred as J-6. Not new.
3. **Agent B P4-004 "Span test overstates readiness"** — true but folds into K-5 (both cover the same concern).
4. **Agent A P4-008 "no CHECK on policy_events.evt_id"** — too broad. Evt IDs are free-form strings that follow a naming convention, not an enum. The CHECK-drift guard is for enum columns; ID columns aren't its remit.

---

## Round 4 scope

Small round. Three real bugs + a defer:

| ID | Title | Size |
|---|---|---|
| R4-1 | **cos-parser.ts bug sweep** (K-1, K-2, K-3) — newId for memory, delegate INSERT to `writeMemory`, fix bind drift | S |
| R4-2 | **PI hook runId capture** (K-4 fix, plus updated test assertion) | XS |
| R4-3 | **policy/audit.ts: `newId('policy_event')` prefix** (K-4) — add prefix, migrate call site | XS |
| R4-4 | **Bare `ulid()` sweep** — grep for any other first-class ID generation that bypasses `newId` | S |

**Deferred**: K-5 (telemetry production wiring) → folds into H-1 workflow runner brainstorm.
**Skipped**: K-6, K-7 — minor polish, can wait for future rounds or a dedicated "types cleanup" pass.

## Meta-observation

Round 3 added a DB-level guard (CHECK-drift test) that caught a whole
class of bugs retroactively. Round 4 found two bugs of a DIFFERENT class
(bare `ulid()` generating IDs) that have no guard. R4-4 adds that guard:
a grep test that fails if any `packages/*/src/**/*.ts` file (excluding
known list like `graph.ts` which uses ulid for sub-object entity IDs)
contains a bare `ulid()` call that isn't immediately passed to `newId()`.

Pattern: **every round, identify the class of bug that surfaced, then
add a guard for that class so the next round doesn't find another
instance.** Round 3 guard = CHECK constraints. Round 4 guard = ID
prefix generation. Round 5 may surface something new; we keep adding
guards until the fresh-review agents come back empty.
