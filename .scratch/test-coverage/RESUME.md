# Test Coverage — Resume / Execute Prompt

You (Claude or Codex) are the orchestrator. The user invoked you by `@`-referencing
this file with no other arguments. That invocation means RESUME AND KEEP GOING
NOW. It is explicit authorization to detect state, report a short digest, then
continue work without waiting for another user message.

Your job is to drive every test issue to completion under strict TDD as one
continuous dependency queue. Target maximum capacity is 6 concurrent workers.

Read this entire file before you act. Do not skip sections.

Before dispatching any worker, also read:
- `.scratch/test-coverage/MASTER-PLAN.md`
- `.scratch/test-coverage/scenarios/TEST-SCENARIOS.md`
- `.scratch/test-coverage/journeys/USER-JOURNEYS.md`
- `docs/TEST-GAPS.md`

---

## TDD Protocol (MANDATORY — every issue, no exceptions)

Every test issue follows RED → GREEN:

1. **RED:** Write the test file FIRST with all assertions. Tests MUST fail
   against the current codebase. If the test passes immediately → the gap is
   already covered → mark issue completed with note "already covered".
2. **Commit RED:** `test(<scope>): RED — <description>` with failure output
   in commit body.
3. **GREEN:** Fix the code (not the test) to make it pass. The test exposes
   real bugs in the existing implementation.
4. **Commit GREEN:** `fix(<scope>): GREEN — <description>` with pass count
   in commit body.
5. **If test cannot pass** due to missing feature (e.g. `docs.tree` not
   implemented) → commit the RED test and mark issue `Status: blocked-needs-impl`
   with the specific missing feature noted. The failing test stays in the
   codebase as a specification.

Never write a test designed to pass. Write a test that describes correct
behavior. If the code already behaves correctly, the test passes on RED →
mark completed. If not, it exposes a bug → fix it.

---

## Phase Dependencies

```
P1 (infrastructure) ← must pass before anything else
  ↓
P2 (tRPC integration) ← server-side correctness
  ↓
P3 (Playwright) + P4 (TUI) + P5 (inference) + P6 (CLI) ← parallel
  ↓
P7 (cross-surface E2E) ← needs all surfaces working
  ↓
P8 (gate regressions) ← parallel with P7
```

---

## Step 0 — Detect state

Run these checks in parallel:

1. `git status --short` — uncommitted changes?
2. `git log --oneline -5` — recent commits
3. `git branch --show-current` — expected: `main` or `test-coverage/*`
4. Count issues by status:
   ```
   find .scratch/test-coverage/issues -name "*.md" | while read f; do
     grep -m1 '^Status:' "$f" | sed 's/Status: *//'
   done | sort | uniq -c
   ```
5. `bun run --bun tsc --noEmit --pretty false 2>&1 | grep "error TS" | wc -l` — typecheck
6. Verify dev server starts: `cd src/web && timeout 10 npx vite dev --port 5199`

Report a one-screen status digest before any dispatch.

---

## Step 1 — Dispatch queue

For each phase in dependency order:

1. Find all `Status: ready-for-agent` issues in the current phase
2. Check `Blocked-by:` — skip issues whose blockers are not completed
3. Dispatch up to 6 parallel workers
4. Each worker gets an isolated worktree (or explicit disjoint file ownership)

Worker selection:
- **P1 infrastructure:** Use `opus` — these are critical path, need judgment
- **P2 tRPC:** Use `sonnet` — fixture-backed router integration tests; use PGlite only for persistence-contract cases
- **P3 Playwright:** Use `sonnet` — route-by-route e2e tests
- **P4 TUI:** Use `sonnet` — FakeTTY screen tests
- **P5 inference:** Use `sonnet` — sidecar integration
- **P6 CLI:** Use `sonnet` — command execution tests
- **P7 cross-surface:** Use `opus` — complex multi-surface coordination
- **P8 gate regressions:** Use `sonnet` — focused regression tests

---

## Step 2 — Worker prompt template

```
You are a TDD test writer for Fulcrum at /Users/mkh/workspace/fulcrum.

ISSUE: <ISSUE_PATH>
TEST FILE: <TEST_FILE_PATH>
FRAMEWORK: <bun-test|playwright|vitest>

TDD PROTOCOL (MANDATORY):
1. Write the test file FIRST. All assertions must target CORRECT behavior.
2. Run the test: `<test command>`
3. If tests FAIL (RED) → good. Commit: `test(<scope>): RED — <desc>`
   Include first 5 lines of failure in commit body.
4. Fix the SOURCE CODE (not the test) to make tests pass.
5. Run test again: GREEN. Commit: `fix(<scope>): GREEN — <desc>`
   Include pass count in commit body.
6. If tests PASS immediately → the gap was already covered.
   Commit: `test(<scope>): verified — <desc>` and mark completed.

DO NOT:
- Write tests that pass by design (e.g. testing mocks return what you set)
- Skip the RED step
- Modify tests to match broken behavior
- Touch files outside the test file + the specific source file being tested

REPORT BACK:
STATUS: RED | GREEN | ALREADY-COVERED | BLOCKED
COMMIT: <sha>
TEST FILE: <path>
RED OUTPUT: <first 5 lines>
GREEN OUTPUT: <pass count>
BUGS FOUND: <list of real bugs exposed by the test>
```

---

## Step 3 — Persist progress

- Issue `Status:` flips happen via Edit BEFORE commit
- Status values: `ready-for-agent`, `in-progress`, `red`, `green`, `completed`,
  `blocked-needs-impl`
- Running tally in `.scratch/test-coverage/EXECUTION-LOG.md` (append-only)
- Each entry:
  ```
  ## <timestamp> — <orchestrator>
  Phase: P<N>
  Workers: <count>/6
  Completed: <issue-path>: RED@<sha> → GREEN@<sha> | ALREADY-COVERED@<sha>
  Blocked: <issue-path>: reason
  Bugs found: <count> (list in issue file)
  ```

---

## Step 4 — Continuous loop

Continue Steps 1–3 until ALL 119 issues are completed or blocked.

Do not stop at phase boundaries. When P1 completes, immediately start P2.
When P2 completes, start P3+P4+P5+P6 in parallel.

Only stop for:
- User says stop
- All issues completed/blocked
- CI broken in a way that blocks all workers

---

## Acceptance criteria

- [ ] All 119 issues `Status: completed` or `Status: blocked-needs-impl`
- [ ] Every completed issue has a committed test file
- [ ] Every RED test that found a bug has a GREEN fix committed
- [ ] `bun run --bun tsc --noEmit` = 0 errors
- [ ] `docs/TEST-GAPS.md` updated: `[ ]` → `[x]` with test file paths
- [ ] No test file uses mocks where real PGlite/real CLI would work
- [ ] Playwright tests run against actual dev server (not mocked routes)
