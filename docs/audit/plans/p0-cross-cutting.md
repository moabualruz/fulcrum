# P0 — Cross-Cutting Fixes

> Implements all issues from [F0 — Cross-Cutting Audit](../findings/f0-cross-cutting.md).
> These are the highest-leverage changes: every L-series hook is a no-op without F0-ISSUE-01,
> and F0-ISSUE-02 unblocks real agent spawning.

---

## Goal

Wire Fulcrum's existing components together. The code is good; the plumbing is not connected.
The headline fix is a `SessionStart` hook that calls `start_agent_run` automatically so every
downstream hook in the session has a real `runId`.

---

## Issue index

| ID | Title | Severity | Priority |
|----|-------|----------|----------|
| F0-ISSUE-01 | Session lifecycle wiring (SessionStart + Stop hooks + runId) | CRITICAL | P0 |
| F0-ISSUE-02 | Real Claude Code agent adapter in `fulcrum-worker` | CRITICAL | P0 |
| F0-ISSUE-10 | E2E session test (`tests/e2e/claude-session.test.ts`) | CRITICAL | P0 |
| F0-ISSUE-04 | CLAUDE.md build-time codegen (`scripts/gen-claude-md.ts`) | HIGH | P1 |
| F0-ISSUE-06 | Agent profile consumer — resolve `target_role` → DB profile | HIGH | P1 |
| F0-ISSUE-07 | Worktree threading — `spawnAgent` calls `allocateWorktree` | HIGH | P1 |
| F0-ISSUE-09 | Subagent MD registration in installer | HIGH | P1 |
| F0-ISSUE-03 | Stub-handler sweep in workflows (delete or implement) | MEDIUM | P2 |
| F0-ISSUE-05 | Auto-stub task filter (`synthetic` column / tag) | MEDIUM | P2 |
| F0-ISSUE-08 | Trace reader endpoint (`/trace/:trace_id`) | MEDIUM | P2 |
| F0-ISSUE-12 | Real-vs-performative classification table in CI | MEDIUM | P2 |
| F0-ISSUE-13 | `fulcrum doctor` command | MEDIUM | P2 |
| F0-ISSUE-14 | Install step 9 — post-install smoke | MEDIUM | P2 |
| F0-ISSUE-11 | Vocabulary standardisation (types rename pass) | LOW | P3 |
| F0-ISSUE-15 | `validate_schema` realisation or deletion | LOW | P3 |
| F0-ISSUE-16 | Documentation relocation (`docs/gap-analysis/` → `docs/history/`) | LOW | P3 |
| F0-ISSUE-17 | Per-package READMEs | LOW | P3 |
| F0-ISSUE-18 | CLI split (`packages/cli/src/index.ts` → module-per-group) | LOW | P3 |
| F0-ISSUE-19 | Migrations split (`migrations/` directory, one file per migration) | LOW | P3 |
| F0-ISSUE-20 | Zombie code pruning | LOW | P3 |

---

## Dependencies

```
F0-ISSUE-01  ──→  F0-ISSUE-10 (E2E test requires session lifecycle to fire)
F0-ISSUE-01  ──→  F0-ISSUE-06 (profile consumer hooks into start_agent_run)
F0-ISSUE-02  ──→  F0-ISSUE-10
F0-ISSUE-09  ──→  F0-ISSUE-01 (subagent MDs must exist before SessionStart installs them)
F1-ISSUE-02  ──→  F0-ISSUE-01 (SDK migration provides clean hook event surface)
F4-ISSUE-01  ──→  F0-ISSUE-06 (agent_definitions schema must exist first)
```

---

## Task breakdown

### Task 0.1 — Session lifecycle wiring (F0-ISSUE-01) [CRITICAL]

**Files:**
- Create: `agent-integration/claude/hooks/session-start.ts`
- Create: `agent-integration/claude/hooks/session-stop.ts`
- Modify: `agent-integration/install.ts` — register new hooks
- Modify: `packages/worker/src/lifecycle.ts` — read runId from session file
- Create: `.fulcrum/session.json` schema documentation

**Steps:**

- [ ] Write a `SessionStart` hook script (`session-start.ts`) that:
  1. Reads the current working directory (from env or `process.cwd()`)
  2. Calls `fulcrum start-run --role software_engineer --json` via subprocess
  3. Writes the returned `run_id` to `.fulcrum/session.json`
  4. Exits with code 0

- [ ] Write a `SessionStop` hook script that reads `.fulcrum/session.json`
  and calls `fulcrum complete-run <run_id> --summary "session ended"`

- [ ] Update `agent-integration/install.ts` to write the two new hook entries
  into `~/.claude/settings.json` (`SessionStart` / `Stop` matchers)

- [ ] In `packages/worker/src/lifecycle.ts`, update `startAgentRun` to read
  `runId` from `.fulcrum/session.json` when called without an explicit run_id

- [ ] Write test: `packages/worker/src/lifecycle.test.ts` — stub the session
  file, verify `startAgentRun` picks up the runId

- [ ] Commit: `feat(hooks): SessionStart/Stop — wire run lifecycle into Claude sessions`

**Acceptance:** After install, a fresh Claude Code session writes a `run_id` to
`.fulcrum/session.json` and all `PreToolUse` / `PostToolUse` hooks read it.

---

### Task 0.2 — Claude Code agent adapter (F0-ISSUE-02) [CRITICAL]

**Files:**
- Create: `packages/worker/src/adapters/claude-code.ts`
- Modify: `packages/worker/src/adapters/index.ts` — register adapter
- Modify: `packages/worker/src/lifecycle.ts` — use adapter when role fits

**Steps:**

- [ ] Create `claudeCodeAdapter` in `packages/worker/src/adapters/claude-code.ts`:
  ```ts
  export const claudeCodeAdapter: AgentAdapter = {
    name: 'claude-code',
    async spawn(ctx: SpawnContext): Promise<AgentHandle> {
      const proc = spawn('claude', ['-p', ctx.prompt, '--output-format', 'json'], {
        cwd: ctx.workdir ?? process.cwd(),
        env: { ...process.env, FULCRUM_RUN_ID: ctx.runId },
      });
      return buildHandleFromProcess(proc, ctx);
    }
  };
  ```

- [ ] Register in `packages/worker/src/adapters/index.ts` alongside `stubAdapter`
  and `subprocessAdapter`

- [ ] Update `spawnAgent` in `lifecycle.ts`: if `target_role` maps to a Claude
  Code role and `CLAUDE_CODE_BIN` is available, use `claudeCodeAdapter`

- [ ] Write test: mock `spawn`, assert env includes `FULCRUM_RUN_ID`

- [ ] Commit: `feat(worker): Claude Code agent adapter`

---

### Task 0.3 — E2E session test (F0-ISSUE-10) [CRITICAL]

**Files:**
- Create: `tests/e2e/claude-session.test.ts`

**Steps:**

- [ ] Write test that simulates the full Claude hook sequence:
  1. Fire `SessionStart` → assert `.fulcrum/session.json` created with `run_id`
  2. Fire `PreToolUse` → assert `tool_use` row inserted in `trace_events`
  3. Fire `PostToolUse` → assert `tool_result` row inserted
  4. Fire `SessionStop` → assert `agent_runs.status = 'completed'`

- [ ] Use the existing `createTestDb()` helper from `packages/core/src/test-utils`

- [ ] Commit: `test(e2e): Claude session lifecycle — SessionStart through Stop`

**Acceptance:** Test passes from clean state; `ci.yml` includes `pnpm test --filter e2e`.

---

### Task 0.4 — CLAUDE.md codegen (F0-ISSUE-04) [HIGH]

**Files:**
- Create: `scripts/gen-claude-md.ts`
- Modify: `package.json` — add `"gen:claude-md"` script
- Modify: `.github/workflows/ci.yml` — add drift check step

**Steps:**

- [ ] Write `scripts/gen-claude-md.ts` that:
  1. Imports `TOOL_DEFINITIONS` from `packages/cli/src/mcp-tools.ts`
  2. Templates the CLAUDE.md file with the live tool list
  3. Writes `agent-integration/claude/CLAUDE.md`

- [ ] Add CI step: `node --import tsx/esm scripts/gen-claude-md.ts && git diff --exit-code agent-integration/claude/CLAUDE.md`

- [ ] Commit: `feat(scripts): gen-claude-md.ts — build-time CLAUDE.md codegen`

---

### Task 0.5 — Agent profile consumer (F0-ISSUE-06) [HIGH]

**Files:**
- Modify: `packages/worker/src/lifecycle.ts`

**Steps:**

- [ ] In `startAgentRun`, after resolving `target_role`:
  ```ts
  const profile = db.prepare('SELECT * FROM agent_definitions WHERE role = ?').get(targetRole);
  if (profile) {
    ctx.systemPrompt = profile.system_prompt;
    ctx.capabilities  = JSON.parse(profile.capabilities ?? '[]');
  }
  ```

- [ ] Pass `ctx.systemPrompt` into `SpawnContext` so adapters can use it

- [ ] Write test: create a profile row, call `startAgentRun`, assert systemPrompt propagated

- [ ] Commit: `feat(worker): resolve agent profile → system_prompt in SpawnContext`

---

### Task 0.6 — Worktree threading (F0-ISSUE-07) [HIGH]

**Files:**
- Modify: `packages/worker/src/lifecycle.ts`
- Modify: `packages/worker/src/janitor.ts` (or equivalent)

**Steps:**

- [ ] In `spawnAgent`, for code-writing roles (`software_engineer`, `refactor_worker`, etc.):
  ```ts
  if (canWriteCode(role)) {
    ctx.workdir = await allocateWorktree(db, ctx.runId, ctx.taskId);
  }
  ```

- [ ] Ensure `processMergeQueue` is called from the janitor loop on schedule

- [ ] Write test: assert worktree path in `SpawnContext` for `software_engineer` role

- [ ] Commit: `feat(worker): thread worktree allocation into spawnAgent`

---

### Task 0.7 — Subagent MD registration (F0-ISSUE-09) [HIGH]

**Files:**
- Modify: `agent-integration/install.ts` — add step for role MDs
- Create: `agent-integration/claude/agents/` directory with one `.md` per role

**Steps:**

- [ ] For each of the 24 canonical roles, generate a file
  `~/.claude/agents/fulcrum-<role>.md` with frontmatter:
  ```markdown
  ---
  name: fulcrum-<role>
  description: <role description from roles.ts>
  tools: <comma-separated allowed tools>
  ---
  <system prompt from role definition>
  ```

- [ ] Add installer step that writes these files

- [ ] Add test: assert files created and parseable

- [ ] Commit: `feat(installer): register Claude Code subagent MDs for all 24 roles`

---

### Task 0.8 — Stub-handler sweep (F0-ISSUE-03) [MEDIUM]

**Files:**
- Modify: `packages/workflows/src/handlers/` — delete or implement 5 stubs

**Steps:**

- [ ] Audit `search_web`, `search_code`, `run_tool`, `call_mcp_tool`,
  `validate_schema` handlers — determine delete vs. implement

- [ ] For each: either remove from `StepType` union + delete handler, OR
  implement with real logic

- [ ] Add lint check: `grep -r '"stubbed"' packages/workflows/src/ --exit-code`
  in CI

- [ ] Commit: `fix(workflows): remove/implement stub handlers`

---

### Task 0.9 — Fulcrum doctor (F0-ISSUE-13) [MEDIUM]

**Files:**
- Modify: `packages/cli/src/index.ts` — add `doctor` command

**Steps:**

- [ ] Add `fulcrum doctor` command that checks:
  - DB accessible + migrations current
  - MCP server boots (spawn + `initialize` handshake)
  - CLI binary on PATH
  - Hook entries in `~/.claude/settings.json`
  - Session file readable if present

- [ ] Print ✅/❌ per check

- [ ] Commit: `feat(cli): fulcrum doctor — runtime health check`

---

### Task 0.10 — Zombie code pruning (F0-ISSUE-20) [LOW]

**Files:**
- Various — targeted deletions

**Steps:**

- [ ] Verify `artifact_contracts`, `review_targets`, `graph_entities`,
  `graph_edges`, `graph_episodes` tables have zero production callers
  (grep for table names in `packages/` — exclude migrations and tests)

- [ ] Delete them from `fulcrum-core` if unused; add a migration to drop tables

- [ ] Delete `buildWorldState` export if unused

- [ ] Commit: `chore(core): prune confirmed-dead zombie tables and exports`

---

### Task 0.11 — Vocabulary standardisation (F0-ISSUE-11) [LOW]

**Rename pass** (types only, no behaviour change):

| Old name | New name |
|----------|----------|
| `AgentProfile` (interface) | `AgentRoleDescriptor` |
| `AgentProfileRow` (DB row) | `AgentProfile` |
| `HandoffStatus` | `HandoffLifecycle` |

- [ ] Run with `sed` / TypeScript rename refactor

- [ ] Ensure guard tests still pass

- [ ] Commit: `refactor(types): vocabulary standardisation — AgentProfile → AgentRoleDescriptor`

---

### Task 0.12 — Housekeeping: docs relocation, per-package READMEs, migrations split

Covers F0-ISSUE-16, -17, -19.

- [ ] Move `docs/gap-analysis/` → `docs/history/`
- [ ] Add README.md to each `packages/*` that lacks one
- [ ] Split `packages/core/src/migrations.ts` into `migrations/` directory
- [ ] Commit: `chore: doc relocation, per-package READMEs, migrations split`

---

## Deeper Research

Before implementing Task 0.1, verify:

1. **Claude Code `SessionStart` hook spec** — confirm the exact JSON payload
   shape (session_id, cwd, etc.) via R2 research doc §3.2 and the official
   Claude Code docs. The hook must exit 0 and may not write to stdout
   (stderr only for logging).

2. **`claude -p` subprocess API stability** — check whether `claude --print`
   or `claude -p` is stable for non-interactive programmatic use. Consider
   the Claude Code SDK (`@anthropic-ai/claude-code`) if it exposes a
   `runSession(prompt)` API.

3. **`.fulcrum/session.json` concurrency** — if multiple Claude sessions open
   simultaneously (e.g., split panes), they'll race on the file. Use a
   per-session file at `.fulcrum/sessions/<session_id>.json` instead.

4. **Worktree allocation API in `fulcrum-worktrees`** — verify `allocateWorktree`
   exists and its signature before Task 0.6. If it doesn't exist yet, that's
   a dependency on a P6 task.

---

## Acceptance criteria

- `pnpm test` passes with the E2E test in place
- A fresh Claude Code session writes `.fulcrum/session.json` with a real `run_id`
- `SELECT status FROM agent_runs` shows `in_progress` while session is live
- `fulcrum doctor` exits 0 on a correctly-configured machine
- Zero `"stubbed"` strings in `packages/workflows/src/`
