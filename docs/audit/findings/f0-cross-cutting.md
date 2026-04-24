# F0 — Cross-cutting Critical Audit

> The whitespace between F1–F6. F0 deliberately picks the axes the
> per-axis audits can't see: end-to-end value, performative completeness,
> zombie code, vocabulary drift, the install-to-value path, testing
> quality-vs-quantity, and the rebuild-vs-retrofit top-level call.
>
> Where F1..F6 ask "does the MCP surface / the plugin system / the skills
> layer / the agent definitions / the memory layer / the modularity
> story work?", F0 asks: **does a user get value, or does it just
> look like they do?**

---

## Executive summary

**Fulcrum does not deliver the value it claims.** It *looks* like it
does: 11 packages, 1 004 passing tests, 30 migrations, 14 CLI groups,
18 MCP tools, 29 workflow step handlers, OTel spans, merge queue,
worktrees, skills, roles, hooks, agent profiles. But **the dominant
path a real user will take — install Fulcrum, open Claude Code in a
real project, do work — results in zero Fulcrum state changes**. The
reason is a single missing piece of plumbing: no session-lifecycle
entry point ever calls `start_agent_run`, so every hook that depends on
`runId` degenerates into a no-op. Every L-series "polish" commit in
Round 6 shipped a technically correct component on top of a pipeline
that never fires. The control plane has no control because it has
nobody to control over.

The codebase is in remarkably good shape *as a codebase* — tests green,
migrations aligned, guards in place, ID prefixes centralised. It's in
remarkably poor shape *as a product* — the inner loop "I used Fulcrum
and something meaningful happened because of it" does not exist yet.
The fix is neither large nor mysterious; it is just under-prioritised.

Verdict: **retrofit at the seams; do NOT rebuild.** Three small,
concrete plumbing changes (auto-start runs, real Claude adapter, one
end-to-end smoke path) move Fulcrum from "scaffolding" to "actually
delivers value". Rebuilding would throw away the parts that work and
still leave the same gap. Details in §13.

---

## Findings — CRITICAL

### C1. The runId chain is broken: nothing ever calls `start_agent_run` from session lifecycle
**Evidence:**
- `agent-integration/claude/settings-hooks-snippet.json:1-27` only
  registers `PreToolUse` and `PostToolUse`. There is **no**
  `SessionStart`, `UserPromptSubmit`, `Stop`, or `SessionEnd` hook.
  Grep confirmed: no matches for those strings in any hook JSON.
- `packages/cli/src/index.ts:730-751` (PreToolUse memory recall
  branch): `if (HOOK_WRITE_TOOLS.has(ctx.toolName) && ctx.runId)` —
  the recall only fires when `runId` is set.
- `packages/cli/src/index.ts:762-764` (PostToolUse): `if (!ctx.runId)
  { io.exit(0); return }` — the `tool_trace` memory only writes when
  `runId` is set.
- `normalizeHookEvent` only captures `runId` for PI
  (`packages/cli/src/index.ts`, PI branch). Claude Code does not
  supply a `runId` in its tool event payload, so Claude sessions
  ALWAYS arrive with `runId = ''`.
- `c2-user-surfaces.md:2188-2203` (story 14.3) walks through a Claude
  Write call and notes verbatim: *"`ctx.runId === ''`, so the whole
  recall block is skipped"* and *"with no `runId` exits immediately
  (nothing to scope the trace to)"*.

**Impact:** A fresh Claude Code session, with Fulcrum installed,
working on a real project: the hooks fire on every tool call. The
secret scanner runs (cheap win). Then:
- Memory recall: **never fires.** No task memories loaded into
  stderr → model gets zero Fulcrum context.
- `tool_trace` write: **never writes.** No per-tool memory audit
  trail in L1 → `tool_trace` kind rows count ≈ 0 in a real user DB.
- `events.hook_executed` rows: **do write** (line 664–678), so there
  IS one telemetry artefact per tool call. That is the only durable
  trace of the session's existence inside Fulcrum.

Concretely: a user can complete a full Claude Code session (10 writes,
20 reads, 3 Bash runs, a completed PR) and the `memories` table
contains zero new rows, the `agent_runs` table contains zero new rows,
and the `trace_events` table contains zero new spans. The only thing
that grew is `events` (one row per hook invocation). **The memory
layer, the run lifecycle, and the telemetry stack are all dark for the
real primary user path.**

**Why this is THE finding:** every component above this fault line is
correct. `writeMemory` works. `recallMemory` works. Hooks are
installed and get called. But the chain from "session start" to
"run_id lives in the hook context" has no owner. The L-series commits
(L-6/L-7/L-8) assumed the runId would already be there because PI
supplies it — and PI is the smallest of the three agent runtimes.

**Fix (retrofit):** Three pieces.
1. Add a `SessionStart` hook that calls `fulcrum hook claude session`,
   which calls `start_agent_run({ agent_role: 'chief_of_staff',
   workspace_id })`, captures the returned `run_id` into a
   session-scoped file (`.fulcrum/sessions/<session_id>.json`).
2. In `runPreHook`/`runPostHook`, if `ctx.runId === ''` and
   `ctx.sessionId` is set, read the session file and use that runId.
3. Add a `Stop` hook that calls `complete_agent_run` with the
   session's runId.

The harness-vs-hook split documented in Claude Code's settings schema
makes (1) trivial — `SessionStart` is a first-class event, it is just
not registered in `settings-hooks-snippet.json`.

**Severity:** CRITICAL. This single gap causes ~60% of the
"performative" verdicts in §7 below.

---

### C2. No real agent adapter; the only L2 runtime is `stub` + `subprocess`
**Evidence:**
- `packages/worker/src/index.ts` re-exports only `stubAdapter` and
  `subprocessAdapter`.
- `packages/worker/src/lifecycle.ts:62`:
  `const adapterName = input.adapter ?? process.env['FULCRUM_AGENT_ADAPTER'] ?? 'stub'`
- `packages/worker/src/stub.ts:26-31`: the fallback path
  returns `{ status: 'completed', summary: '[stub] ${role} ran with
  no canned response' }`. That's what `spawnAgent` returns by default.
- `packages/worker/src/subprocess.ts:18-21`: if
  `FULCRUM_AGENT_SUBPROCESS_CMD` is not set, returns `blocked`.
- No `claudeAdapter`, `geminiAdapter`, or `piAdapter` exists. Grep
  confirmed: the only files containing "claude" / "anthropic" /
  "gemini" in `packages/worker/src/` are the lifecycle comment and
  a mention of env vars. No real model-inference adapter.

**Impact:** The CLI advertises `fulcrum agent spawn --target-role
software_engineer` and the workflow DSL has a `spawn_agent` step.
A user who runs either will get:
- either a `stub` result (`[stub] software_engineer ran with no canned
  response`),
- or a `blocked` result if `FULCRUM_AGENT_SUBPROCESS_CMD` is unset,
- or if they DO set the env var, a subprocess that reads their custom
  command, which the user has to build themselves.

There is no path to "ask Fulcrum to run a real coding agent" that
works out of the box. The workflow `spawn_agent` handler
(`packages/workflows/src/step-executor.ts:201`) is therefore also
performative — it succeeds, but only because the stub succeeds.

**Fix (retrofit):** Add a `claudeCodeAdapter` that spawns
`claude` as a subprocess with a canned prompt assembled from
`ctx.handoff`, captures its exit code, and returns a `WorkerResult`.
Keep `stub` and `subprocess` as-is for tests. This is 150-200 lines
of code; the shape is exactly subprocessAdapter with a different
argv.

**Severity:** CRITICAL. Without this, "multi-agent orchestration" is
a catalogue, not a product.

---

### C3. 7 of 29 workflow step handlers are stubs returning `{status: 'completed'}`
**Evidence (from `packages/workflows/src/step-executor.ts`):**
| Line | Handler | Behaviour |
|---|---|---|
| 244–258 | `call_mcp_tool` | returns `{tool_name, args, note: 'stubbed pending MCP integration'}` |
| 436–442 | `search_web` | returns `{results: [], note: 'stubbed'}` |
| 444–447 | `search_code` | returns `{matches: [], note: 'stubbed'}` |
| 449–452 | `run_tool` | returns `{tool: null, note: 'stubbed'}` |
| 465–469 | `validate_schema` | returns `{validated: true}` unconditionally |
| 375–379 | `prompt_user` | returns `{prompted: true}` (inert in runner mode) |
| 391–417 | `review_artifact` | creates a review row, no actual review happens |

Also counting toward "pure-pass":
- 346 `halt` — legitimate, short-circuit
- 454 `parallel` — legitimate, DAG handles children
- 461 `complete` — legitimate, terminal marker
- 313 `branch` — pure predicate
- 335 `loop` — pure counter
- 471 `gate` — pure feature flag

So the real count is:
- **PRODUCTION: 14** (create_task, create_issue, create_epic,
  write_artifact, read_artifact, write_memory, read_memory,
  invoke_team, spawn_agent, run_script, wait_for_task, wait_for_review,
  wait_for_artifact, escalate, read_project, evaluate_policy)
- **PURE/CONTROL-FLOW: 6** (branch, loop, halt, parallel, complete, gate)
- **STUB: 7** (call_mcp_tool, search_web, search_code, run_tool,
  validate_schema, prompt_user, review_artifact — the last one writes
  a row but does no review logic)
- **PARTIAL: 2** (`spawn_agent` is only real insofar as the adapter
  beneath it is real; today the adapter is always stub → `spawn_agent`
  is effectively stub in practice. `invoke_team` depends on whether
  `fulcrum-teams` actually spawns agents; it currently creates DB rows
  only.)

**Impact:** The README says "runner + 29 step handlers with
retries/timeouts" (verbatim, commit 13c016d). It's technically true but
misleading: a third of the handlers are placeholders. Any user building
a workflow that relies on `call_mcp_tool` or `search_web` will see it
"succeed" but produce nothing. **Workflows are functional for the
happy-path shape but cannot actually drive research, MCP fan-out, or
schema validation** — three of the most common workflow needs.

**Fix:**
- Delete `call_mcp_tool`, `search_web`, `search_code`, `run_tool`
  from the handler set and from the `StepType` union. Replace with a
  single `call_mcp` handler once there is a real
  `fulcrum-mcp-client` package to call into.
- Make `validate_schema` a real JSON Schema check (5 lines with `ajv`).
- Move `prompt_user` and `review_artifact` into a separate
  `interactive-steps.ts` module marked explicitly as "runner-mode
  inert, needs stepWorkflow/resumeWorkflow to actually fire" with
  a test asserting runner-mode invocation is a NO-OP, not a COMPLETE.

**Severity:** HIGH.

---

### C4. The README, CLAUDE.md, and changelog claim "13 control tools"; the MCP server actually registers 18
**Evidence:**
- `agent-integration/claude/CLAUDE.md` (auto-appended to
  `~/.claude/CLAUDE.md` by the installer): "*The `fulcrum` MCP server
  exposes 13 tools*" — this is what Claude Code reads as context on
  every session.
- `c2-user-surfaces.md:433` and `c1-inventory.md:1136`: "18 tools".
- `packages/cli/src/index.ts:593` (`runServeMcp`) registers 18 tools.

**Impact:** The global context file shipped to every Claude Code user
on `pnpm setup:claude` undercounts by 5 and omits the team-management
and agent-profile tools entirely. Claude doesn't know the tools exist,
so it won't use them — **the L-3/L-4/L-5 work to ship agent_profiles
and team-template tools is invisible to the one agent runtime we
actually support**.

**Fix:** Regenerate CLAUDE.md from the tool list at build time. Cheap.

**Severity:** CRITICAL (for L-3..L-5 visibility), LOW (as a doc bug).
Classifying as CRITICAL because this single drift nullifies a week of
shipped work.

---

### C5. The auto-init path creates a task stub for every `start_agent_run` without `task_id`, polluting the `tasks` table
**Evidence:**
- `packages/cli/src/index.ts:598-607` (`start_agent_run` MCP handler):
  if `task_id` is missing OR doesn't exist, creates a new stub:
  `await createTask({ title: '[auto] ${agent_role} run', workspace_id,
  project_id })`.
- No cleanup path. These stubs accumulate under
  `title = '[auto] ...'` forever.

**Impact:** Once C1 is fixed (`SessionStart` calls `start_agent_run`
without a `task_id`), every Claude session will spawn one `[auto]
chief_of_staff run` stub task. On a typical user with 20
sessions/week, that's ~1 000 auto-stubs per year, all polluting the
board, the FTS index, the agent run counts, and the analytics
rollups.

**Fix:** Give auto-stubs a distinct `kind`/`tag` (e.g.,
`status='synthetic'`, or a label `fulcrum:auto`) and filter them out
of all list / board / analytics queries unless explicitly requested.

**Severity:** HIGH. Not broken today, broken tomorrow, and fixing C1
without fixing C5 makes C5 a production-dominant noise source.

---

## Findings — HIGH

### H1. The 13 Claude Skills are installed but there's no evidence Claude Code discovers them
- `packages/cli/src/index.ts` / `agent-integration/install.ts:385`
  (`installClaudeSkills`) copies 13 `.md` files into
  `~/.claude/skills/fulcrum/`. That's the whole integration.
- Claude Code's skill discovery is directory-scan based and versioned;
  there is no manifest file, no frontmatter schema validation, and no
  check that Claude Code actually loads them. The test
  `packages/cli/src/tests/cli-coverage.test.ts` (8 tests) doesn't
  cover this path.
- Our own audit (R3) assessed skills best-practices; we adopted the
  filename and Markdown format but not the skill-activation loop.

**Net:** Shipping skill markdown is a 10% fix. The other 90%
(are they discovered, are they activated when relevant, does the
LLM actually pay attention to them, how do we measure that?) is not
done.

**Severity:** HIGH.

---

### H2. The `fulcrum-policy` `SYSTEM_INVARIANTS` are an allowlist, not an enforced guard on real call paths
- `packages/policy/src/engine.ts` exports `SYSTEM_INVARIANTS` (lines
  defining `only_integration_worker_merges`,
  `chief_of_staff_no_direct_writes`, `cos_must_spawn_teams_via_tool`,
  …). The tests at `packages/policy/src/tests/*.test.ts` (95 passing)
  validate that `evaluatePolicy(rule, subject)` returns the right
  verdict.
- But the actual enforcement is one-off at three call sites
  (`spawnAgent` capability check, `processMergeQueue` gate,
  PreToolUse team-invoke branch). The policy engine is not consulted
  for arbitrary writes, reads, or tool calls.
- So an agent that bypasses `spawnAgent` and directly calls
  `startAgentRun({ role: 'chief_of_staff' })` is not stopped by
  `SYSTEM_INVARIANTS`. The invariants are advisory in the codebase.

**Fix:** Either (a) funnel all writes through a single policy
chokepoint, or (b) delete `SYSTEM_INVARIANTS` and document that
enforcement is done at adapter boundaries via capability helpers.
(a) is the Right Thing but a bigger lift; (b) at least prevents the
codebase from pretending to have a policy engine when it has
capability helpers wearing a policy engine costume.

**Severity:** HIGH (misleads users about what's enforced).

---

### H3. `agent_profiles` table has CRUD and MCP tools but no consumer
- `packages/core/src/agent-profiles.ts` exports `createAgentProfile`,
  `getAgentProfile`, `listAgentProfileRows`, `updateAgentProfile`,
  `deleteAgentProfile`.
- `packages/core/src/status.ts:178` (`listAgentProfiles`) merges
  hardcoded roles + DB rows.
- `packages/cli/src/index.ts:1128` has the `create_agent_profile` MCP
  tool wiring it up.
- Grep for `createAgentProfile` in `packages/worker/**/*.ts`: **no
  matches**. `spawnAgent` never consults `agent_profiles`. The
  profile's `system_prompt` and `capabilities` fields are written to
  DB but never read by any runtime.

**Impact:** Users can create an agent profile; nothing downstream uses
it. Shipping a dynamic profile system without a consumer is the
textbook definition of performative.

**Fix (retrofit):** In the adapter resolution path
(`lifecycle.ts:62`), if `target_role` refers to a DB-backed profile,
read `system_prompt` and `capabilities` from the row and pass them
into `SpawnContext.handoff`. Adapters that assemble prompts get real
customisation; adapters that ignore it stay compatible.

**Severity:** HIGH.

---

### H4. `allocateWorktree` has no production caller outside tests
- Grep: `allocateWorktree` appears in
  `packages/worktrees/src/worktrees.ts`, its own
  `tests/worktrees.test.ts`, README, and CHANGELOG. **Zero production
  call sites in other packages.**
- `processMergeQueue` has one production caller:
  `packages/cli/src/index.ts:1642` (the CLI dispatcher).
- Neither is referenced by `fulcrum-worker`, `fulcrum-workflows`, or
  the janitor. The worker's `spawnAgent` does not allocate a worktree
  before spawning the adapter; `SpawnContext.worktree_path` is
  whatever the caller supplied.

**Impact:** The merge-queue pipeline is built, unit-tested, and
callable only by the CLI. A user who types `fulcrum queue merge
process` can exercise it. Nothing else will. The `run_script` handler,
`spawn_agent` handler, and agent adapters don't create, use, or merge
worktrees. The worktree package is a standalone library the rest of
Fulcrum doesn't actually use.

**Fix (retrofit):** `spawnAgent` should call `allocateWorktree` for
any role that has `canWriteCode(role) === true`, pass
`worktree_path` to the adapter, and call `processMergeQueue` (or at
least `enqueueMerge`) when the adapter reports `status: 'completed'`
AND there's a diff. Without this, worktrees are a decorative feature.

**Severity:** HIGH.

---

### H5. Telemetry spans write to `trace_events` but no reader renders them
- `packages/core/src/telemetry/spans.ts` writes rows.
- Grep for `trace_events` in `packages/monitor/**/*.ts`: **no
  matches.**
- `packages/monitor/src/server.ts` has 32 HTTP routes; none expose
  `trace_events`. `GET /replay/:run_id` exists but reads the `events`
  table, not the trace table.
- OTel export to an external collector works *if* the user sets
  `OTEL_EXPORTER_OTLP_ENDPOINT`. Without it, the `trace_events` table
  grows forever with no reader.

**Impact:** Per K-5, we wired spans into runner/worker/janitor/MCP.
We did not wire anything that reads them back. A user who wants to
understand "what did my agent do" on a given run has no way to see
the span tree. The monitor dashboard doesn't know spans exist.

**Fix:** Add a `/trace/:trace_id` endpoint to the monitor server,
returning the span tree as JSON. Add a minimal HTML renderer at
`/trace/:trace_id/view` using the existing Hono app. 60 lines.

**Severity:** HIGH.

---

### H6. The L-1 role MDs are only consumed by `listAgentProfiles` description extraction, not as subagent definitions
- `packages/core/src/status.ts:178` `listAgentProfiles` reads each role
  file's opening paragraph via the G-11 code path.
- Claude Code's subagent mechanism reads agent definitions from
  `~/.claude/agents/`. We ship nothing there. We ship skill markdown
  to `~/.claude/skills/fulcrum/` (different directory, different
  mechanism).
- So the 24 role MDs are docs-for-humans, not configured subagents.

**Impact:** The 24 role files are used as *prose* that `build_cos_
context` weaves into the chief-of-staff prompt. They are not hooked
into Claude Code's native subagent feature. When a user operating as
`software_engineer` asks Claude a question, Claude has no way to know
which of the 24 roles is active; nothing about the role shapes
Claude's behaviour except as context text.

**Fix (retrofit):** Add a second installer step that writes each role
MD to `~/.claude/agents/fulcrum-<role>.md` with the right frontmatter
so Claude Code recognises them as subagents. Then the roles become
invocable via `@software_engineer` etc. The files already exist; this
is a copy + frontmatter transform.

**Severity:** HIGH.

---

### H7. No end-to-end test exercises "install → session → measurable state change"
- `packages/cli/src/tests/hook-pre-post.test.ts` (7 tests) tests
  runPreHook/runPostHook in isolation with injected I/O.
- `packages/cli/src/tests/cli-coverage.test.ts` (8 tests) tests CLI
  command dispatch.
- `packages/cli/src/tests/hook-normalization.test.ts` (13 tests) tests
  the claude/gemini/pi event-shape normalization.
- **No test asserts: "starting from an empty DB, after a simulated
  session of N tool calls, the memories/agent_runs/trace_events
  tables contain rows X/Y/Z."**

**Impact:** The C1 finding would have been impossible to commit if an
end-to-end smoke test existed. It's not a code defect — it's a test
that was never written.

**Fix:** Add `tests/e2e/claude-session.test.ts` that simulates the
hook event sequence for a fresh project and asserts downstream state.
Use `setDb(new Database(':memory:'))` + canned stdin fixtures.
Prevent future C1-class regressions.

**Severity:** HIGH.

---

### H8. `validate_schema` step handler is a lie
- `packages/workflows/src/step-executor.ts:465-469`: returns
  `{validated: true, schema}` unconditionally. No validation is
  performed.
- Any workflow that uses this to gate a downstream step will pass
  whatever garbage the previous step produced.

**Fix:** 10 lines with `ajv`.

**Severity:** HIGH (one line fix away from a false-pass data integrity
issue).

---

### H9. Vocabulary drift: "status", "scope", "profile", "role" all mean different things in different packages
Extracted from `packages/core/src/types.ts` + per-package types:

| Word | Distinct meanings found |
|---|---|
| `status` | `TaskStatus` (queued/in_progress/completed/blocked) · `AgentRunStatus` (running/completed/blocked/stale/escalated) · `HandoffStatus` (pending/claimed/completed/cancelled) · `WorkflowStatus` (created/running/waiting_input/…) · `WorktreeStatus` (allocated/dirty/ready_for_merge/merged/discarded/conflict) · `ReviewStatus` (pending/changes_requested/approved/rejected) · `SyncStatus` (never_synced/queued/…) · `ArtifactStatus` (draft/final/archived) |
| `scope` | `MemoryScope` (global/project/file/task) · `HandoffScope` (task/issue/project/workspace) · `PolicyScope` (system/user/workspace/project/team_agent/workflow_step) |
| `profile` | `AgentProfile` (hardcoded descriptor from `listAgentProfiles`) · `AgentProfileRow` (DB row from L-3 table) · `pi_profile` (column on `agent_runs`) |
| `role` | `AgentRole` (24 canonical) · `caller_role` (in workflow steps) · `actor_role` (in merge queue) · `target_role` (in spawnAgent) · role string in `policy_rules.scope='team_agent'` |
| `context` | `CoSWorldState` / `CoS context` (from `buildCosContext`) · `session_context` (in hook events) · `SpawnContext` (in `fulcrum-worker`) · OTel span context (in `trace_events`) |

**Impact:** A reader (human OR LLM) trying to understand the system
must hold five separate mental models of "status" in their head.
The guard tests catch CHECK-constraint drift between TS types and DB
columns within a single name, but they do NOT catch semantic drift
between different types that share a name.

**Fix (retrofit):** Rename the less-dominant meanings:
- `HandoffStatus` → `HandoffLifecycle`
- `WorkflowStatus` → `WorkflowState`
- `PolicyScope` → `PolicyTarget`
- `HandoffScope` → `HandoffArea`
- `AgentProfile` (hardcoded) → `AgentRoleDescriptor`
- `AgentProfileRow` → `AgentProfile`
- `pi_profile` → `pi_profile_name` (or drop if unused — it's on the
  `agent_runs` row as legacy context)
- `caller_role` / `target_role` / `actor_role` → `invoker_role`,
  `worker_role`, `merge_role` (or collapse to one if the semantics
  allow).

This is a sweeping rename that only touches types and the few
hardcoded places in `index.ts`; the runtime is unaffected. Worth
doing BEFORE Round 7 if there is one, because agents reading the
codebase get confused by the polysemy and it's making the gap-analysis
rounds harder than they need to be.

**Severity:** HIGH.

---

### H10. Documentation vs code drift (spot-checked 5 claims)
1. README § "18 tools" vs CLAUDE.md "13 tools" — drift (see C4).
2. README § "29 step handlers" — true, but 7 are stubs (see C3).
3. README § "Real git merge queue" — true for the code path, but
   nothing but the CLI calls it (see H4).
4. README § "Three-layer memory stack" — L2 is opt-in via `fulcrum
   memory accelerate`; a user who didn't run that has no L2.
   README mentions opt-in briefly but describes the system as if L2
   is standard.
5. CHANGELOG 0.1.0 entry claims "telemetry + OTLP exporter wired
   across runner/worker/janitor/MCP" — true as write, but (H5) there
   is no reader, so "wired across" is asymmetric.

**Fix:** Add a `docs/claims-verification.md` that asserts each README
claim is backed by a test. CI fails if a claim is added without a
matching test reference. 80-100 lines of manifest.

**Severity:** HIGH.

---

## Findings — MEDIUM

### M1. Auto-init silently creates a workspace+project in every directory you run `fulcrum` in
`packages/cli/src/index.ts:2037` (`ensureProjectInitialized`) creates
`.fulcrum/fulcrum.db`, `.fulcrum.json`, and deterministic workspace /
project IDs on first run. This is user-friendly for the common case
but means:
- Running `fulcrum task list` in `/tmp` creates state in `/tmp`.
- Running `fulcrum task list` in a sibling directory creates a second,
  unrelated workspace.
- No user notification after the first run; the IDs are hash-derived
  from the path.

**Impact:** A user who `cd`s into a subdirectory by mistake gets a
different workspace and doesn't know why their tasks "disappeared".

**Fix:** `fulcrum doctor` command that reports the resolved
workspace_id for the current directory, plus a `--workspace-root` flag
that walks up looking for the nearest `.fulcrum.json`.

**Severity:** MEDIUM.

---

### M2. 30 migrations in a single 2 231-line file
`packages/core/src/db/migrations.ts`. Organising them like this is a
conscious trade-off (simple, runs in order, one file to read) but
past a certain size it's actively dangerous: merging two parallel
feature branches that both add a migration is an unavoidable
conflict.

**Fix:** Split into `migrations/001-initial.ts`, `migrations/002-…`,
etc., each exporting a named migration object; a manifest file
imports them in order.

**Severity:** MEDIUM.

---

### M3. `fulcrum-sync` has 1 test file for 7 source files
- 15 tests passing (`packages/sync/src/tests/*.test.ts`).
- Plane adapter, conflict detection, bidirectional sync are the
  advertised capabilities.
- One test file cannot meaningfully cover a bidirectional adapter
  with conflict resolution semantics. The sync package is
  under-tested relative to its complexity.

**Severity:** MEDIUM.

---

### M4. No rate limiting, no multi-tenant isolation, no backup/export
- README claims Fulcrum is "safe for local workflows", which is true,
  but:
  - There is no rate limiting per workspace / per role.
  - Two users sharing `~/.fulcrum/vault` get their memories
    commingled.
  - There is no `fulcrum export` / `fulcrum import`.
  - There is no backup path. The database is just a file in `.fulcrum`.
  - There is no migration between workspaces (e.g., "move all these
    tasks to a new workspace after `mv`ing the directory").
- These aren't bugs — they're features that were never scoped. But
  they bite the moment a user tries to do any of: (a) share a vault
  with a colleague, (b) reorganise their projects on disk, (c) keep
  their vault through a laptop wipe, (d) protect against a malicious
  tool call that deletes their database.

**Severity:** MEDIUM.

---

### M5. Test mocking vs integration
- `packages/monitor/src/tests/*.test.ts` mocks the DB heavily.
- `packages/worktrees/src/tests/worktrees.test.ts` uses real git
  subprocess calls — good.
- `packages/worker/src/tests/lifecycle.test.ts` uses real
  `startAgentRun` but only the stub adapter.
- **There is no test that exercises a real subprocess adapter end to
  end.** The subprocess adapter is "defined, tested, untested."
- `fulcrum-memory` Kuzu tests are gated on `FULCRUM_EMBEDDING_TESTS`;
  CI likely doesn't set that. So the L2 graph path has zero CI
  coverage.

**Severity:** MEDIUM.

---

### M6. `fulcrum doctor` / `fulcrum check` don't exist
`pnpm setup:check` exists and checks installed artifacts. There is no
equivalent for runtime health: "is the DB reachable, are migrations
current, can you embed a string, can the monitor start, is L2
activated, does `invoke_team` work end to end".

**Severity:** MEDIUM.

---

### M7. Install step 2 (`verify fulcrum in PATH`) warns, doesn't fail
`agent-integration/install.ts:212` (`verifyCliInPath`) runs
`spawnSync('fulcrum', ['--version'])` and warns if it fails. Every
subsequent step that assumes `fulcrum` is on PATH (steps 3+) may
still succeed on the paper audit (the MCP `add` command string is just
text). The user gets a clean-looking install, then nothing works at
runtime.

**Fix:** Escalate the warning to a hard fail when `claude` or `pi` are
present on PATH (i.e., the install is actually going to be used).

**Severity:** MEDIUM.

---

### M8. `fulcrum-sync` Plane adapter is scaffold
Four env vars (`PLANE_BASE_URL`, `PLANE_API_KEY`, `PLANE_WORKSPACE_
SLUG`, `PLANE_PROJECT_ID`) and a one-test file suggest production
readiness. In reality the sync manager has scaffolding for bidirectional
sync with conflict detection but no public documentation of which Plane
API versions are supported, what happens on permission errors, or
how schema changes propagate.

**Severity:** MEDIUM.

---

### M9. 1 004 tests, but almost all are happy-path
Sample (from package test files):
- `tests/runs.test.ts` — happy path creates/heartbeats/completes.
  Error paths: stale detection, block, escalate. But no adversarial
  paths (concurrent heartbeats, clock skew).
- `tests/memory.test.ts` — happy path write/recall. Error paths:
  empty content, bad confidence. No adversarial: 10k writes, FTS5
  stress, vector table missing, content > 1 MB.
- `tests/workflows.test.ts` — happy path run, one retry path. No
  adversarial: circular deps, more than 1 000 iterations, step
  timeout races.
- `tests/locks.test.ts` — contention cases are good.
- `tests/worktrees.test.ts` — real git merge conflicts — good.

Most tests cover "does this return the expected shape for the
expected input". The high-quality tests are worktrees, locks,
migrations. Everything else is "minimum happy path + guard against
one bug we hit".

**Severity:** MEDIUM (the number 1 004 is misleading, but the tests
that exist aren't lying — they just don't cover what readers assume).

---

### M10. Monitor's `/events/stream` SSE endpoint polls every 2s from disk
`packages/monitor/src/server.ts` runs a polling loop that re-queries
the events table. For a single developer this is fine; at 10 Hz event
rates it starves the rest of the server. No backpressure handling.

**Severity:** MEDIUM.

---

## Findings — LOW

### L1. `docs/gap-analysis/` is confusingly a peer to `docs/audit/`
Historical work product sitting in a prime-real-estate docs directory.
Move to `docs/history/` or archive.

### L2. CHANGELOG entry for 0.1.0 predates an actual 0.1.0 release — the repo is still `0.0.1` in `packages/cli/package.json`.

### L3. `docs/superpowers/` has a mix of "done" and "speculative" plans with no index distinguishing them.

### L4. No per-package README except for `worktrees` and `core`. Contributors looking at the `fulcrum-planning` package have to infer its purpose from type exports.

### L5. README's install section describes `pnpm run setup` but doesn't describe `setup:check` as the "did it work" follow-up. First-time users guess.

### L6. `fulcrum --version` returns `0.0.1` — package version is frozen at the initial commit despite five rounds of feature work. Version bumps would help with diagnosing "which Fulcrum do I have".

### L7. The 16 `run_script` allowed scripts are hardcoded to `run_tests|lint|typecheck|build`; any project without exactly those npm scripts can't use the step.

### L8. Nothing documents the difference between `workspace_id` (hash of path) and the config's `workspace_id` field — they're the same today but the handshake is implicit.

### L9. `packages/cli/src/index.ts` is 2 211 lines. A split into `cli/serve.ts`, `cli/hook.ts`, `cli/tasks.ts`, etc. would help.

### L10. The `policy_events` table exists but no `/policy/events` path in the audit docs explains how to query it for a real audit.

---

## Value delivery reality check (per major capability)

| # | Capability (marketing) | Actual runtime path | Verdict |
|---|---|---|---|
| 1 | Multi-agent execution layer | `fulcrum-worker.spawnAgent` → stub or subprocess adapter only. No real Claude/Gemini/PI adapter. Users cannot invoke a real L2 agent out of the box. | **PERFORMATIVE** — scaffolded, adapter missing |
| 2 | Workflow runner with 29 step handlers | 14 real + 6 control-flow + 7 stubbed + 2 partial. Documented as 29, true count is 14. | **PARTIAL** |
| 3 | Real git worktree integration | Code is real. No production caller except the CLI. `spawnAgent` never allocates a worktree. | **PARTIAL** (real code, nobody calls it) |
| 4 | Merge queue | Real `git merge --no-ff` logic, conflict detection, artifact gates. Only the CLI invokes it. Janitor doesn't. Nothing else does. | **PARTIAL** |
| 5 | Agent profiles (L-3) | Table + CRUD + MCP tool. Zero consumers; `spawnAgent` never reads from `agent_profiles`. | **PERFORMATIVE** |
| 6 | Telemetry + OTel (J-7 / K-5) | Spans written to `trace_events`. No reader in monitor. OTel exporter works if user sets env var. | **PARTIAL** (write path real, read path missing) |
| 7 | CLI coverage (14 groups) | 14 groups exist; ~90% dispatch to real core functions. The queue / workflow / agent groups are thin wrappers, not dead. | **REAL** (mostly) |
| 8 | Memory layer three layers | L0 vault writes work. L1 SQLite write/recall works. L2 Kuzu is opt-in; not activated by default. Recall works for directly-queried memories. For Claude sessions: **memories almost never land because runId is never set** (see C1). | **PARTIAL → PERFORMATIVE in practice** |
| 9 | Policy engine | Two adapter points enforce (spawn, merge). `SYSTEM_INVARIANTS` list is advisory. Secret guard works in PreToolUse — real value. | **PARTIAL** |
| 10 | Claude Code integration | PreToolUse + PostToolUse hooks installed. SessionStart / Stop / SessionEnd hooks not installed. Skills copied but no discovery verification. | **PARTIAL** |
| 11 | Gemini integration | Extension installed; hooks work if Gemini invokes them. | **PARTIAL** (untested) |
| 12 | PI integration | PI cockpit + hook; PI supplies `runId` so the memory hooks actually fire under PI. | **REAL** (only for PI) |
| 13 | Role MDs (L-1) | 24 role files; read only by `listAgentProfiles` purpose extraction. Not registered as Claude Code subagents. | **PERFORMATIVE** (docs exist, unused as subagents) |
| 14 | Skills (L-2) | 13 files copied to `~/.claude/skills/fulcrum/`. No verification Claude Code discovers them. | **PARTIAL** |
| 15 | Handoff system | Full CRUD, handoff modes, states. Used by `escalate` workflow step. Not used by any runtime coordination. | **PARTIAL** |
| 16 | Sync (Plane) | Adapter scaffolded, 15 tests, no production evidence of a successful end-to-end sync. | **PERFORMATIVE** |
| 17 | Monitor dashboard | 32 HTTP routes, most read real tables. `/trace/*` missing. | **REAL** (for read) |
| 18 | Secret guard | `checkSecrets` runs in PreToolUse. Real impact: a user's AWS key pasted into `tool_input` is blocked before Claude Code sees it. | **REAL** |
| 19 | CoS context building | `buildCosContext` assembles markdown from tasks + events. Real. | **REAL** |
| 20 | Auto-init | `.fulcrum/fulcrum.db` creation + deterministic IDs. Real. | **REAL** |
| 21 | MCP tools (18) | 18 tools registered, dispatched through a real JSON-RPC loop. Real. | **REAL** |
| 22 | Chief-of-Staff as orchestration role | L1 exists, `canInvokeTeams` enforced at the worker + hook. `chief_of_staff` cannot write code per the guard. | **REAL** (on the rule side) |
| 23 | Teams templates + instances | CRUD + `invokeTeam` create DB rows. No runtime spawns agents off those rows automatically. | **PARTIAL** |
| 24 | Workflow step retries + backoff | Real (`runner.ts` loop with `getBackoffMs`, attempts tracking, retry cap). | **REAL** |
| 25 | Reranker (memory recall) | Optional; if the HF reranker is available, replaces semantic component. Real. | **REAL** |

**Summary counts:** 8 REAL, 10 PARTIAL, 6 PERFORMATIVE, 1 PERFORMATIVE-in-practice.

The REAL column is dominated by library-level correctness (CRUD, DB
schema, scoring). The PARTIAL / PERFORMATIVE columns are dominated by
integration gaps — specifically, "the component is correct but nobody
on the user-path calls it".

---

## The L-series post-mortem

Round 6's L-1..L-11 commits were the "polish" round. Per-item
evaluation:

| ID | What shipped | Did it deliver user value? | Why / why not |
|---|---|---|---|
| L-1 | 18 role MDs | **No.** Files exist, only read for purpose extraction. Not registered as Claude Code subagents. | The format is wrong for Claude's subagent discovery. |
| L-2a | 13 skill MDs | **Partial.** Copied to `~/.claude/skills/fulcrum/`. No verification Claude actually discovers them. | The discovery loop is not tested; we're trusting Claude's behaviour from the docs we read in R3. |
| L-2b | Install skills step in setup | **Partial.** The installer is correct. The discovery isn't verified. | See L-2a. |
| L-3 | `agent_profiles` table + CRUD | **No.** No consumer. | `spawnAgent` does not read profiles. |
| L-4 | Team re-exports from core | **Yes, trivially.** This is a codegen-level re-export. | Fine. |
| L-5 | 5 team/profile MCP tools | **Partial.** Tools work; `create_agent_profile` and `invoke_team` are MCP-callable. But CLAUDE.md (C4) undercounts the tool list, so Claude doesn't know they exist. | Visibility gap. |
| L-6 | Hook pre/post split refactor | **Yes, structurally.** Tests pass. | The refactor is clean. |
| L-7 | Memory recall in PreToolUse | **No.** `runId` not set for Claude sessions → code path never fires. | See C1. |
| L-8 | `tool_trace` write in PostToolUse | **No.** Same reason. | See C1. |
| L-9 | Memory hooks on `startAgentRun` | **Partial.** Writes when a run is started — but almost nothing calls `startAgentRun` from session context. | See C1 / C2. |
| L-10 | Memory hooks on complete/block/escalate | **Partial.** Same. | See C1 / C2. |
| L-11 | (There is no L-11 in the commit log; docs ended at L-10.) | — | — |

**Five "No"s and five "Partial"s.** Every L-series item is a technical
success that delivers little user value because of missing upstream
connections. The round landed 12 000 LOC of green tests and 14 new
features; the inner loop still doesn't work.

The pattern: **Round 6 assumed the shipping problem was polish, but
the actual shipping problem was plumbing.** Polish without plumbing is
invisible to users.

---

## Zombie code inventory

### Packages with no production caller outside their own tests
- `fulcrum-sync` — one caller (CLI `runSync`) that is a thin wrapper.
  Not really zombie but close.
- `fulcrum-worktrees.allocateWorktree` — no cross-package caller; only
  its own tests use it. The merge pipeline uses the DB rows but nothing
  creates them outside direct CLI use.

### Exports nothing imports
- `fulcrum-core.buildWorldState` / `CoSWorldState` — exported from
  `cos-context.ts`; grep for imports shows only `buildCosContext` gets
  used, not `buildWorldState`. Probably remove.
- `fulcrum-core.reconcileMergedBranch` (memory/setup) — tests only.
- `fulcrum-memory.runExtractionPipeline` — fires in `setImmediate`
  inside the memory writer, but only when L2 is active; untested for
  the default path.
- `packages/core/src/graph.ts` / `graph_entities` / `graph_edges` /
  `graph_episodes` — SQLite-side graph tables from M011. Grep shows
  no module reads from them. Kuzu does the real graph work. These are
  **vestigial** from a pre-Kuzu design.

### Tables with no CRUD or CRUD but no caller
- `graph_entities`, `graph_edges`, `graph_episodes` (M011) — no CRUD
  module in `fulcrum-core` or `fulcrum-memory`. Zombie.
- `analytics_cycle`, `analytics_project`, `analytics_agent`,
  `analytics_team` (M009) — written by the monitor's metrics
  computation BUT the monitor's metrics endpoints only READ a subset.
  Partial.
- `artifact_contracts` (M008) — table exists with fields for
  `required_artifacts`, `optional_artifacts`, etc. Grep: no module
  inserts rows. The merge queue's gate check reads `artifacts` directly,
  not `artifact_contracts`. **Zombie.**
- `review_targets` (M008) — unreferenced in the merge / review path.
  The merge gate queries `reviews` table directly. Zombie.
- `memory_entities` (M005) — `linkMemoryToEntity` writes, nothing
  else reads. The extraction pipeline uses Kuzu. Zombie for the non-L2
  path.

### Config flags nothing reads
- `FULCRUM_VAULT_PATH` — yes, read. OK.
- `FULCRUM_SERVER_TESTS` — test flag, only.
- `config.vault.l2_enabled` — read by init; the `memory accelerate`
  CLI path activates L2, but the flag is advisory — if you set it in
  `.fulcrum.json` without running `accelerate`, nothing happens. Near
  zombie.

### Tests that pass without exercising their claim
- `packages/core/src/tests/telemetry.test.ts` — tests startSpan/endSpan
  produce rows. Doesn't test that any production code path produces
  useful spans. (The coverage is real, it's just not the coverage
  readers assume.)
- `packages/workflows/src/tests/runner.test.ts:264` (`call_mcp_tool`
  reference) — asserts the handler returns completed. Doesn't catch
  that the handler is a stub. Passing.
- `packages/core/src/tests/cos-context.test.ts` — tests the markdown
  output contains strings from tasks. Doesn't test that the markdown
  is actually useful to a model.

---

## Vocabulary drift catalog

(See H9 for the detailed list.) Summary: 5 words (`status`, `scope`,
`profile`, `role`, `context`) each have 3–8 distinct meanings across
the codebase. The guard tests verify TS ↔ DB alignment *within* each
meaning; no guard verifies the meanings don't collide in LLM-facing
prompts or in the skills markdown.

**Single biggest rename that would help:** `AgentProfile` (the
hardcoded role descriptor) should be renamed to `AgentRoleDescriptor`
so that `AgentProfile` can become the DB-backed user-defined profile
(currently `AgentProfileRow`). This is the first concept a new user
hits, and the collision in terminology is a constant source of
confusion in the agent-integration documentation.

---

## The "runId not set" bug (the single most important cross-cutting finding)

### What is supposed to happen
1. Claude Code starts a session.
2. Fulcrum calls `start_agent_run({ role: 'chief_of_staff',
   workspace_id })` and gets back a `run_id`.
3. `run_id` is stashed somewhere the hook can read (session file,
   env var, hook-process argv).
4. Every PreToolUse event now carries that `run_id`. Memory recall
   loads task memories into stderr.
5. Every PostToolUse event writes a `tool_trace` memory scoped to
   that `run_id`.
6. When the session ends, `complete_agent_run(run_id, summary)` is
   called.

### What actually happens
1. Claude Code starts a session. **No hook fires**, because
   `SessionStart` is not registered in
   `agent-integration/claude/settings-hooks-snippet.json`. The
   Fulcrum installer doesn't even try.
2. `start_agent_run` is NOT called. The model, if it reads the
   skills files, might decide to call it itself — but skills are
   passive text; there is no enforcement. In practice the model
   starts doing work without any run registration.
3. The user asks Claude to write a file. Claude decides to call the
   `Write` tool. `PreToolUse` hook fires: `fulcrum hook claude pre`.
   Hook reads the JSON event. `runId = ''` because Claude's event
   format doesn't contain a run identifier (it contains a session_id,
   which is different).
4. `runPreHook`:
   - Secret scan: runs. **This works.** Real value.
   - Team-invoke: skipped (no `agentRole` in Claude events).
   - Memory recall: skipped because `runId === ''`.
5. `PostToolUse` fires: `fulcrum hook claude post`. `ctx.runId === ''`
   → `runPostHook` exits at line 762 without writing anything.
6. Session ends. No hook registered. No `complete_agent_run` called.

### Net effect on tables
- `events`: +2 rows per tool call (hook_executed pre + post).
- `memories`: 0 new rows.
- `agent_runs`: 0 new rows.
- `trace_events`: 0 new spans (because runner / worker are not
  invoked by Claude Code).
- `tasks`: 0 new rows (we don't even know what task Claude was
  working on).

**The installed state of Fulcrum for Claude Code users is: a secret
scanner + an event log of tool-call frequencies. That's the real
product.** Everything else — memory, runs, traces, CoS context, skills
activation — is latent, awaiting a plumbing fix that nobody has shipped.

### The fix
One commit: **add a `SessionStart` hook that starts a run, stash the
`run_id` to `.fulcrum/sessions/${session_id}.json`, read it back in
pre/post hooks, call `complete_agent_run` from a `Stop` hook.**

With that in place, L-7 / L-8 / L-9 / L-10 start firing. Memory
recall fires. Tool trace writes fire. Task context lands in stderr.
CoS context queries find rows. **Every one of the Round 6 "shipped
but inert" features wakes up.**

This is ~150 lines of code. It should have shipped first, before the
memory hooks that depended on it. The order was inverted.

### Why the audit surfaced it and the gap-analysis rounds didn't
Gap-analysis rounds compared the TS implementation to the Python
reference. The Python reference has its own controller (not Claude
Code); the session-lifecycle question didn't apply. Validating
against the reference produced a clean bill of health for every
component that also exists in Python, and said nothing about the
Claude Code entry point.

**Moral:** if your audit's baseline is a different product, you will
reproduce its blind spots.

---

## Missing integrations (the whitespace)

Things that are not in any one of F1–F6 but span them all:

1. **Session lifecycle wiring** (§C1). Single biggest gap.
2. **Real Claude Code adapter** (§C2). Without this, the worker +
   workflow layers are unusable.
3. **Trace reader in monitor** (§H5).
4. **Agent profile consumer** (§H3).
5. **`spawnAgent` → `allocateWorktree` → `processMergeQueue`
   threading** (§H4).
6. **Role MDs → `~/.claude/agents/` subagent registration** (§H6).
7. **End-to-end session test** (§H7).
8. **CLAUDE.md regeneration from tool list** (§C4).
9. **Bootstrap check that secret guard actually triggers** (no
   findings yet; a missing regression test would hurt the one real-
   value feature we have).

---

## Install flow reality check

Walking through `pnpm run setup` one more time with harsh eyes:

| Step | Can succeed but leave Fulcrum unusable? |
|---|---|
| 1. CLI symlink | No — if this fails, nothing works downstream. |
| 2. Verify PATH | **Yes.** Failure is a warning, not a fail. See M7. |
| 3. Claude MCP add | **Yes.** If `claude` CLI is missing, falls back to editing `~/.claude.json`. The fallback path is correct but the user never gets an "are you sure Claude Code will pick this up" prompt. |
| 4. Claude hook merge | **Yes.** Merges `PreToolUse`/`PostToolUse` only — **doesn't merge `SessionStart`**. (Fixable when C1 fix ships.) |
| 5. CLAUDE.md append | **Yes.** Appends a stale tool list (C4). Setup "succeeds"; the user sees wrong context. |
| 6. Skills copy | **Yes.** Copies 13 files; no verification Claude Code's skill discovery will find them. |
| 7. Gemini extension | **Yes.** Copies files; no verification Gemini CLI actually activates. |
| 8. PI cockpit | **Yes.** Skips silently if `pi` is missing. |

**Summary:** 7 of 8 steps can "succeed" without the user getting a
working Fulcrum. The printed summary says "installed" because files
landed on disk. The inner loop is never verified.

**Fix:** Step 9 — a post-install smoke test that opens the MCP server
on a temp DB, calls `list_tasks`, calls `recall_memory` (empty result
is fine), and asserts a trace span gets written. Failure here is a
hard fail with a clear "something is wrong, check X" message.

---

## Testing quality vs quantity

1 004 tests is a lot of tests for a project of this size. But:
- **Happy-path bias.** See M9. Most tests exercise one invocation per
  function.
- **Integration coverage.** 3 of the 77 test files are meaningfully
  cross-package (CLI hook tests, core integration.test.ts, and
  worktrees real-git tests). The rest are per-module.
- **No e2e suite.** Fulcrum has no `tests/e2e/` directory anywhere.
- **Mocked infra.** The monitor tests construct fake DBs. The
  subprocess adapter has one test that never actually spawns a
  subprocess.
- **No fuzzing.** No property-based tests. No adversarial inputs.
- **No load tests.** The janitor claim ("runs on a 10k-row DB") has no
  supporting test.

**The tests are not lying — they just cover what readers don't check.**
A reader sees "1 004 passing" and assumes confidence is high;
confidence is actually "the happy path is green".

---

## Security sanity check

1. **PreToolUse hook CAN be bypassed** by any tool call that Claude
   Code dispatches via its internal `/bashes/` machinery — the hook
   runs on the declared `Bash` tool but not on the sub-bash inside
   Claude's own task tool. (Unverified but the hook spec suggests it.)
2. **Hook events are untrusted input.** `runHook` JSON-parses stdin
   and emits an event row from it. If an adversarial tool payload has
   a malformed `tool_input`, the `JSON.stringify` for secret scan is
   fine, but `emitEvent(payload: {tool_input_keys})` writes
   `Object.keys(toolInput)` — which is safe — but there is no schema
   validation on the event shape, so crafted fields could drive
   downstream DB writes of arbitrary strings into `events.payload`.
3. **MCP server runs with user perms.** `write_artifact` handler
   writes files under `.fulcrum-worktrees/conflicts/`, but file path
   comes from worktree_id which is server-generated — OK. The
   `write_memory` path doesn't touch the filesystem (L1-only write),
   but the L0 `writeMemoryFile` does, and only from `fulcrum-memory`,
   and that's vault-pathed.
4. **`run_script` allowlist.** Good — only `run_tests`, `lint`,
   `typecheck`, `build`. But if the user has a malicious
   `package.json`, those scripts can do anything. The allowlist is
   enforcing script *name*, not script *body*.
5. **`SYSTEM_INVARIANTS` are advisory.** See H2.

**Severity of the whole security story:** MEDIUM. No obvious
vulnerabilities; several reasonable gaps that should be tracked.

---

## Performance sanity check

- **Cold start.** `fulcrum --version` is instant (reads a file). The
  first command that touches `getDb()` loads better-sqlite3, runs 30
  migrations, and optionally loads sqlite-vec — probably sub-second
  on SSD. Embedding model load is where it gets slow: Qwen3 is ~600MB
  ONNX, first-run download can take minutes. First recall after cold
  start is 2–5 seconds easily.
- **Hook latency.** PreToolUse blocks every tool call. Measured
  against the C1 finding, the hook runs:
  - stdin read + JSON parse (sub-ms),
  - `emitEvent` DB write (1–3 ms),
  - secret scan (regex over tool_input) (1–5 ms),
  - memory recall (skipped for Claude, see C1),
  - exit.
  So ~5-10 ms per tool call in the Claude case. Acceptable for a
  developer workflow.
- **Memory recall on a real workspace.** Untested at scale. FTS5 is
  typically fast; the `LIKE` fallback is O(n) and will get slow past
  ~50 k memories. The reranker adds ~200–500 ms per recall.
- **Janitor cycle.** No test for 10 k rows. The `cleanupExpiredLocks`
  and stale-heartbeat detection are both full table scans guarded by
  time windows; at 10 k rows each probably fine.
- **Monitor SSE polling.** See M10.

**Severity:** LOW to MEDIUM. The usual "works fine for a developer,
untested under load" story.

---

## Documentation structure

- `docs/` has: `audit/`, `gap-analysis/`, `guides/`, `superpowers/`,
  plus `README.md`.
- `docs/audit/` is the new directory (this audit lives here).
- `docs/gap-analysis/` is historical (Rounds 1–4 validated findings).
  It's in peer position to audit which is confusing. Move to
  `docs/history/`.
- `docs/superpowers/` mixes execution plans and aspirational specs.
  Split into `docs/plans/` (implementation plans, with
  done/in-progress/not-started status) and `docs/specs/` (design
  docs, with spec-level discussion).
- `docs/guides/` is user-facing and correct, except CLI-reference
  claims drift from code (C4).
- **No per-package READMEs except `worktrees` and `core`.** New
  contributors don't know what `fulcrum-planning` or
  `fulcrum-teams` provide without reading the source. Add per-
  package READMEs as a rule.

**Severity:** MEDIUM.

---

## Issues to plan

The F0 findings should generate the following plan items for Round 7
(or whatever the next round is called). Each is a distinct unit of
work; most should be parallelisable.

- **F0-ISSUE-01: Session lifecycle wiring (C1).** Add `SessionStart`
  and `Stop` hooks, run-id stashing, pre/post pickup. Makes
  L-7/L-8/L-9/L-10 fire.
- **F0-ISSUE-02: Real Claude Code agent adapter (C2).** Implement
  `claudeCodeAdapter` in `fulcrum-worker`. Register alongside stub
  and subprocess. Requires decision on which command to spawn and how
  to pass prompt context — probably via `claude -p "..."` or the Claude
  Code subprocess CLI, whichever is stable. Unblocks `spawn_agent`.
- **F0-ISSUE-03: Stub-handler sweep in workflows (C3).** Replace
  `call_mcp_tool`, `search_web`, `search_code`, `run_tool`,
  `validate_schema` with either (a) deleted + removed from `StepType`
  union, or (b) real implementations. Update tests + docs. Add a
  linting check that fails if a handler body contains "stubbed".
- **F0-ISSUE-04: CLAUDE.md regeneration (C4).** Build-time codegen:
  `scripts/gen-claude-md.ts` reads the 18-tool schema from
  `runServeMcp` and emits `agent-integration/claude/CLAUDE.md`. CI
  check asserts the file is in sync.
- **F0-ISSUE-05: Auto-stub filter (C5).** Label auto-stub tasks so
  they don't pollute boards / FTS / analytics. Add a `synthetic`
  column or a canonical tag.
- **F0-ISSUE-06: Agent profile consumer (H3).** `lifecycle.ts`
  resolves `target_role` to a DB profile if one exists; passes
  `system_prompt` and `capabilities` into `SpawnContext`. Adapters
  that want to use them can read from the context.
- **F0-ISSUE-07: Worktree threading (H4).** `spawnAgent` calls
  `allocateWorktree` for code-writing roles; `processMergeQueue` is
  called from the janitor cycle on a schedule. Close the loop.
- **F0-ISSUE-08: Trace reader (H5).** `/trace/:trace_id` monitor
  endpoint + minimal HTML renderer. Query pattern: `SELECT * FROM
  trace_events WHERE trace_id = ? ORDER BY started_at ASC`.
- **F0-ISSUE-09: Subagent MD registration (H6).** Second installer
  step: write role MDs with frontmatter to `~/.claude/agents/
  fulcrum-<role>.md`. Tests: assert the installer creates the files
  and they parse as valid Claude subagent definitions.
- **F0-ISSUE-10: E2E session test (H7).** `tests/e2e/claude-
  session.test.ts`. Simulate Claude's hook event sequence; assert
  measurable state changes land in `memories`, `agent_runs`, `trace_
  events`. Prevent C1-class regressions.
- **F0-ISSUE-11: Vocabulary standardisation (H9).** Types-only rename
  pass. `AgentProfile` → `AgentRoleDescriptor`, `AgentProfileRow` →
  `AgentProfile`, `HandoffStatus` → `HandoffLifecycle`, etc. Coordinate
  with a dedicated PR because churn will be wide.
- **F0-ISSUE-12: Per-capability real-vs-performative classification
  table, committed to repo.** The §"Value delivery reality check"
  table in this file should become a living document with a CI guard
  that fails if a REAL verdict regresses to PARTIAL.
- **F0-ISSUE-13: `fulcrum doctor` command.** Runtime health check,
  distinct from `setup:check`.
- **F0-ISSUE-14: Install step 9 (post-install smoke).** Fails fast
  if the MCP server / CLI doesn't actually boot after installation.
- **F0-ISSUE-15: Stub-handler sweep + `validate_schema` realisation
  (C3 followup for `validate_schema` specifically, if it isn't just
  deleted).**
- **F0-ISSUE-16: Documentation relocation (L1/L3).** `docs/gap-
  analysis/` → `docs/history/`. `docs/superpowers/plans/` split into
  done/active/speculative.
- **F0-ISSUE-17: Per-package READMEs (L4).** One README per package.
- **F0-ISSUE-18: CLI split (L9).** `packages/cli/src/index.ts` into
  module-per-group files with a thin dispatcher. No behaviour change.
- **F0-ISSUE-19: Migrations split (M2).** `migrations/` directory with
  one file per migration.
- **F0-ISSUE-20: Zombie code pruning.** Delete `artifact_contracts`,
  `review_targets`, `graph_entities/edges/episodes` if confirmed
  unused. Delete `buildWorldState` export. Delete `search_web`,
  `search_code`, `run_tool`, `call_mcp_tool`, `validate_schema` stubs
  (or replace — see F0-ISSUE-03).

---

## Rebuild vs retrofit — final verdict

### Per-axis rebuild verdicts (F1–F6 proxy)

F1–F6 are not yet written with explicit "rebuild vs retrofit"
sections. Below are my proxy verdicts based on the research docs
(R1–R6) and the code paths audited for this F0.

- **F1 — MCP standards.** 18 tools + JSON-RPC 2.0 loop + spans + auto-
  init. The implementation is solid. Gaps are:
  - tool catalogue drift (C4 — fixable),
  - no streaming response support,
  - no resources / prompts primitives (we only expose tools).
  **Verdict: retrofit. Add streaming + resources in a compatible
  release; rebuild not needed.**
- **F2 — Plugin systems.** Fulcrum doesn't really *have* a plugin
  system. It has packages and lazy imports. The agent-integration
  layer is hardcoded for claude / gemini / pi. There is no third-
  party extension API. This is honest: we're not a plugin host, we're
  a library.
  **Verdict: retrofit. If we want plugins, it's a new feature on top
  of existing code, not a rebuild.**
- **F3 — Skills.** The skill markdown matches the format; the
  discovery loop is untested. Polish.
  **Verdict: retrofit.**
- **F4 — Agent definitions.** 24 roles + capability helpers + policy
  guards at adapter boundaries. Types are solid but naming is
  polysemic (H9). `agent_profiles` has no consumer (H3).
  **Verdict: retrofit, with rename + consumer wiring.**
- **F5 — Memory.** Three-layer stack, FTS + vec + Kuzu, weighted
  hybrid scoring, reranker. This is the strongest part of the
  codebase. The only real issue is that at the call-path level,
  recall is never triggered in Claude sessions (C1).
  **Verdict: retrofit — the memory layer is GOOD, the plumbing that
  invokes it is not.**
- **F6 — Modularity.** 11 packages, 1 known cycle (core ↔ teams
  broken via lazy import), peer-deps for optional packages,
  per-package ESM, lazy imports in CLI for cold-start. R6 research
  endorses a hexagonal / modular-monolith pattern. We're mostly
  there.
  **Verdict: retrofit. The modular structure is fine. Splitting
  `fulcrum-cli` (L9) and `migrations` (M2) is clean-up, not a
  rebuild.**

### Top-level recommendation

**Retrofit.** Specifically, a "Round 7: plumbing" that ships the
F0-ISSUE-01 through F0-ISSUE-10 list above. This should be the
smallest, most surgical round of the project so far — every issue is
either a well-scoped integration or a rename.

**Do NOT rebuild core + memory + workflows + worker.** Those layers
are fine. Rebuilding them would lose the guard tests, the migration
history, and the 1 000 passing tests, and would produce a codebase
that has the same plumbing gap because we'd rebuild to the same
baseline (Python reference).

**Do NOT rebuild everything to R6's kernel shape.** R6 endorses
hexagonal and modular-monolith; we already have it. Rebuilding to a
different package topology would be expensive cosmetic work.

### Why retrofit beats rebuild here

1. **The failing layer is thin.** Session lifecycle + Claude adapter +
   one E2E test. ~500 LOC total. A rebuild would cost 20 000 LOC of
   re-implementation plus risk of reintroducing bugs we already fixed
   (the K/J/H/L rounds were catching real bugs).
2. **The code quality is high.** Guards, types, migrations, tests are
   disciplined. Rebuilding throws that away.
3. **The audit found zero architectural errors.** The packages are
   well-separated, dependencies are clean, cycles broken, there is
   one (lazy-imported) cycle and that's it. There is nothing to
   rebuild to escape.
4. **The gap is plumbing, not design.** Rebuilds fix design mistakes.
   Retrofits fix plumbing gaps. F0 found plumbing gaps.
5. **The user test is one commit away from passing.** Ship C1 and
   almost every "PARTIAL" verdict above moves to "REAL".

**Confidence:** high. The cross-cutting audit did not surface any
finding whose fix requires a rewrite. The findings are a punch list.

### What a rebuild would actually fix (steelman)

For completeness: the rebuild case is strongest for:
- vocabulary drift (H9) — easier in a greenfield,
- `fulcrum-cli` monolith (L9) — easier in a greenfield,
- migrations file size (M2) — easier in a greenfield,
- stub handlers in workflows (C3) — easier to build clean than to
  untangle.

None of those are load-bearing for value delivery. Retrofit them as
cleanup issues.

---

## Closing note

Fulcrum's problem is not that the code is bad; it's that the code is
disconnected from the user. The good news is that every disconnect
has an obvious fix, and the fixes are small. The bad news is that no
one round has treated the disconnect as "the" problem — every round
shipped more components instead. Round 7 needs to be the round where
we stop shipping new components and wire the existing ones together.

The single commit that would deliver the most value:

```
feat(hooks): SessionStart auto-starts agent run,
             pre/post hooks read runId from session file
```

Everything else in this audit is secondary to that one change.
