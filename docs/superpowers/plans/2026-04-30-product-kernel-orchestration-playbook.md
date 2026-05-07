# Product Kernel Orchestration Playbook

> **For agentic workers:** REQUIRED SUB-SKILLS: Use `subagent-orchestration` plus `subagent-driven-development`. This playbook orchestrates execution of `docs/superpowers/plans/2026-04-30-product-kernel.md`; it does not replace that plan.

**Goal:** Execute the product-kernel plan with maximum safe parallelism, strict task dependencies, TDD, two-stage review, and explicit fallback gates.

**Inputs:**

- Spec: [`docs/superpowers/specs/2026-04-30-product-kernel-research-design.md`](../specs/2026-04-30-product-kernel-research-design.md)
- Plan: [`docs/superpowers/plans/2026-04-30-product-kernel.md`](2026-04-30-product-kernel.md)
- Project rules: [`AGENTS.md`](../../../AGENTS.md)
- Live state: [`HANDOVER.md`](../../../HANDOVER.md)

**Execution mode:** Fresh subagent per implementation task, isolated worktree for every parallel write lane, spec review before quality review, parent integrates only reviewed work.

---

## Non-Negotiable Rules

- The parent orchestrator owns scheduling, dependency graph, integration, final verification, and user escalation.
- Every implementation subagent gets full task text copied from the plan. Do not tell a subagent to "read the plan and figure it out".
- Parallel write lanes must use isolated worktrees and disjoint owned paths.
- No two workers own `package.json`, `bun.lock`, `apps/cli/src/main.ts`, `HANDOVER.md`, or `README.md` at the same time.
- Implementation must follow the TDD iron law: no product behavior code before a failing test proves the missing behavior.
- Missing RED evidence is a task failure. Tests written after implementation do not count.
- Every task needs two reviews before integration: spec-compliance review first, code-quality review second.
- Reviewer findings are fixed in the worker lane and re-reviewed before integration.
- Parent accepts a task only after checking files, diff, focused tests, and reported evidence.
- Failure gates stop dependent work. Do not continue with a tool after its gate fails.
- No embeddings, RAG, semantic search, local model, or remote model dependency can enter this implementation.

## TDD Evidence Contract

Every behavior task report must contain a RED/GREEN evidence block:

```text
TDD Evidence:
- RED command: <exact command>
- RED result: FAIL, with expected missing behavior: <short exact failure>
- GREEN command: <same or narrower exact command>
- GREEN result: PASS
- Task gate: <exact command> PASS
```

Required local commit shape inside each worker lane:

```text
test(<scope>): red for <behavior>
feat(<scope>): implement <behavior>
```

For multi-behavior tasks, repeat red/green locally for each behavior before moving to the next behavior. The parent does not integrate a red-only commit, but it must be able to inspect worker lane history or report evidence proving tests existed and failed before implementation.

Allowed before RED:

- dependency install needed by test imports
- empty directories
- compile-only skeleton exports that throw `new Error("not implemented")` when static imports need a module to exist; no logic, SQL, I/O, state mutation, branching, or dummy return values
- reading docs/config

Rejected before RED:

- exported runtime functions/classes
- migrations that make tests pass
- CLI dispatch/wiring
- Svelte route/component behavior
- search/context/ranking logic
- dummy return values that make a test pass

If a worker accidentally writes behavior code before RED, it must delete that behavior code, run the RED test, and implement fresh from the test.

## Worktree Layout

Use external worktrees so project-local folders stay clean:

```bash
mkdir -p ~/.config/superpowers/worktrees/fulcrum
```

Lane naming:

```text
~/.config/superpowers/worktrees/fulcrum/product-kernel-task-01-db
~/.config/superpowers/worktrees/fulcrum/product-kernel-task-02-ui
~/.config/superpowers/worktrees/fulcrum/product-kernel-task-03-markdown
~/.config/superpowers/worktrees/fulcrum/product-kernel-task-04-state
...
```

Parent stays in `/Users/mkh/workspace/fulcrum` and integrates reviewed changes back to `main` only after gates pass.

## Controller Preflight

- [ ] Read `AGENTS.md`, `HANDOVER.md`, the spec, and the product-kernel plan.
- [ ] Run:

```bash
git status --short
bun run ci
```

- [ ] Confirm current dirty files are either known docs from prior research or intentional.
- [ ] Extract each plan task into controller notes with full task text, files, dependencies, commands, and failure gates.
- [ ] Build current task graph from this playbook; update it after every result.
- [ ] Create one integration checklist item per plan task.

## Dependency Graph

```text
Wave 0: Controller preflight
  ↓
Wave 1: Compatibility gates in parallel
  Task 1 Database Compatibility Spike
  Task 2 UI Compatibility Spike
  Task 3 Markdown And Frontmatter Kernel
  Task 4 State Store Compatibility
  ↓ all required gates pass
Wave 2a: Schema
  Task 5 Product Schema Migrations
  ↓
Wave 2b: Core services
  Task 6 Repositories And Event Log
  Task 8 Queue And Agent Run Kernel
  ↓ Task 6 passes
Wave 2c: Retrieval
  Task 7 Search And Context Assembly
  ↓
Wave 3a: Surfaces in parallel where ownership allows
  Task 9 Early CLI Surface
  Task 10 Doctor And Uninstall Integration
  Task 11 Web Shell And State Bridge
  ↓
Wave 3b: Final docs
  Task 12 Documentation And Handover
  ↓
Final review and branch finish
```

## Parallel Lane Ownership

| Task | Lane | Owned write paths | Shared-file rule | Effort |
|---|---|---|---|---|
| 1 | `task-01-db` | `src/product-kernel/db/*`, `src/product-kernel/compat.test.ts` | Dependency changes reported to parent; parent serially integrates `package.json`/`bun.lock`. | medium |
| 2 | `task-02-ui` | `apps/web/*` | Dependency changes reported to parent; no React. | medium |
| 3 | `task-03-markdown` | `src/product-kernel/markdown.ts`, `src/product-kernel/markdown.test.ts` | Dependency changes reported to parent. | medium |
| 4 | `task-04-state` | `src/product-kernel/state/*`, `src/product-kernel/state.test.ts` | Dependency changes reported to parent. | low |
| 5 | `task-05-schema` | `src/product-kernel/db/migrate.ts`, `src/product-kernel/db/migrations/*`, `src/product-kernel/db/migrate.test.ts` | Requires Task 1 integrated. | high |
| 6 | `task-06-repos-events` | `src/product-kernel/store/repositories.ts`, `src/product-kernel/events.ts`, `src/product-kernel/events.test.ts` | Requires Task 5 integrated. | medium |
| 7 | `task-07-search-context` | `src/product-kernel/search.ts`, `src/product-kernel/context.ts`, search/context tests | Requires Tasks 5 and 6 integrated. | high |
| 8 | `task-08-jobs-runs` | `src/product-kernel/jobs.ts`, `src/product-kernel/jobs.test.ts` | Requires Task 5 integrated. | medium |
| 9 | `task-09-cli` | `apps/cli/src/product.ts`, `apps/cli/src/product.test.ts`, `apps/cli/src/main.ts` | Requires Tasks 6 and 7 integrated. Owns `apps/cli/src/main.ts` only during this lane. | medium |
| 10 | `task-10-doctor-uninstall` | `apps/cli/src/doctor.ts`, `apps/cli/src/doctor.test.ts`, `apps/cli/src/uninstall.ts`, `apps/cli/src/uninstall.test.ts` | Requires Task 5 integrated. HANDOVER note goes to Task 12 unless Task 12 is not running. | medium |
| 11 | `task-11-web` | `apps/web/*` | Requires Tasks 2, 4, and 6 integrated. No React. | high |
| 12 | `task-12-docs` | `README.md`, `HANDOVER.md`, `docs/product-kernel.md` | Runs after Tasks 1-11 integrate. Owns all final docs. | medium |

## Wave 1 Execution

Dispatch Tasks 1-4 together in separate worktrees. Parent continues preparing review prompts and integration checklists.

Each implementer receives:

- Full text of its task from `2026-04-30-product-kernel.md`.
- Spec link and the exact product constraints: Postgres-compatible kernel, PGlite local default, PostgreSQL server mode, Svelte/shadcn-svelte, Markdown/frontmatter canonical, zustand/vanilla state, no React, no embeddings/RAG/models.
- Owned paths from the ownership table.
- Instruction: do not edit shared docs, `apps/cli/src/main.ts`, `HANDOVER.md`, or unrelated code.
- Instruction: if dependency installation modifies `package.json`/`bun.lock`, report exact dependency diff and keep it inside the lane until parent integrates.

Acceptance gates:

```bash
bun test src/product-kernel/compat.test.ts
bun test src/product-kernel/markdown.test.ts
bun test src/product-kernel/state.test.ts
bun run --bun tsc --noEmit
```

Task 2 also runs the Svelte/shadcn build gate defined in the plan.

TDD gate:

- Tasks 1, 3, and 4 must produce RED/GREEN evidence.
- Task 2 must prove it added tooling/config only. If product UI behavior appears, Task 2 fails and that behavior moves to Task 11 with RED/GREEN tests.

Parent integration order after reviews pass:

1. Task 1 database dependency and files.
2. Task 3 Markdown dependency and files.
3. Task 4 Zustand dependency and files.
4. Task 2 Svelte/shadcn dependency and files.
5. Run focused gates again from parent.

Failure handling:

- Task 1 PGlite fail: freeze Tasks 5-10 and dispatch Convex spike only after user-visible note is written into controller status.
- Task 2 Svelte fail: freeze Task 11 and dispatch Vue + shadcn-vue spike.
- Task 3 Markdown round-trip fail: switch to frontmatter patcher inside Task 3 before integration.
- Task 4 Zustand fail: switch to TanStack Store behind the same `createFulcrumStore` API.

## Wave 2 Execution

### Wave 2a: Task 5 Schema

Run Task 5 alone because downstream services depend on the migration shape.

Acceptance gate:

```bash
bun test src/product-kernel/db/migrate.test.ts
```

Parent integrates Task 5 only after spec and quality reviews pass.

TDD gate: Task 5 must include RED evidence from `bun test src/product-kernel/db/migrate.test.ts` before migrations are written.

### Wave 2b: Tasks 6 And 8 In Parallel

Dispatch after Task 5 integrates.

Task 6 owns repositories/events. Task 8 owns jobs. They may both read migration files but only Task 5 owns migration edits unless a reviewer requires a schema fix. Schema fixes go through parent and re-run Task 5 migration tests.

Acceptance gates:

```bash
bun test src/product-kernel/events.test.ts
bun test src/product-kernel/jobs.test.ts
```

TDD gate: Task 6 and Task 8 each need RED/GREEN evidence before integration.

### Wave 2c: Task 7 Retrieval

Dispatch after Task 6 integrates. Task 7 needs stable `edges`, event/project/task helpers, and search schema.

Acceptance gate:

```bash
bun test src/product-kernel/search.test.ts src/product-kernel/context.test.ts
```

Task 7 spec review must explicitly confirm:

- no embeddings
- no RAG
- no semantic expansion
- deterministic ordering
- byte-identical context assembly for same inputs
- RED/GREEN evidence for both search and context behavior

## Wave 3 Execution

### Wave 3a: Tasks 9, 10, 11

Dispatch in parallel only if ownership is clean:

- Task 9 can run after Tasks 6 and 7 integrate.
- Task 10 can run after Task 5 integrates, but prefer starting after Task 9 if product CLI changes affect doctor output.
- Task 11 can run after Tasks 2, 4, and 6 integrate.

If Task 9 and Task 10 both need `apps/cli/src/main.ts`, Task 9 owns it and Task 10 waits.

Acceptance gates:

```bash
bun test apps/cli/src/product.test.ts
bun run apps/cli/src/main.ts product init --json
bun test apps/cli/src/doctor.test.ts apps/cli/src/uninstall.test.ts
bun run --bun tsc --noEmit
bun run ci
```

Task 11 review must explicitly confirm:

- no React packages
- shadcn-svelte components are copied source
- no third-party product UI base
- first views are backed by real product-kernel queries, not static fake data
- RED/GREEN evidence for web state/query behavior before routes/components were wired

### Wave 3b: Task 12 Docs

Run after all behavior lanes integrate.

Task 12 owns:

- `README.md`
- `HANDOVER.md`
- `docs/product-kernel.md`

Task 12 must document:

- local PGlite mode
- Docker Compose/PostgreSQL server mode for team/local-power use
- production/SaaS `DATABASE_URL`
- deterministic retrieval policy
- failure-gate table as implemented, not merely planned
- no React, no embeddings/RAG/model dependency

Acceptance gate:

```bash
bun run ci
git status --short
```

## Per-Task Subagent Prompt Template

Use this for every implementation subagent. Replace bracketed sections before dispatch.

```text
You are implementing one task from Fulcrum's product-kernel plan in an isolated worktree.

Workspace:
[absolute worktree path]

Required skills:
- test-driven-development
- verification-before-completion

Read first:
- AGENTS.md
- HANDOVER.md
- docs/superpowers/specs/2026-04-30-product-kernel-research-design.md

Do not read the whole plan for task discovery. Your assigned task text is below and is authoritative.

Task:
[paste complete task text from docs/superpowers/plans/2026-04-30-product-kernel.md]

Ownership:
[paste owned write paths]

Constraints:
- Follow the task to the tee.
- TDD iron law: no product behavior code before a failing test. Write the smallest failing test first, run it, verify the failure is for the expected missing behavior, then implement.
- A missing-module, syntax, or import error is not valid RED evidence. If static imports need files to exist, create only compile-only skeleton exports that throw `not implemented`, then rerun until failure proves missing behavior.
- If you already wrote behavior code before the RED test, delete that behavior code and restart from the test. Do not adapt tests around existing implementation.
- Do not edit paths outside ownership unless you report NEEDS_CONTEXT.
- Do not add React.
- Do not add embeddings, RAG, semantic search, local model, or remote model dependency.
- Do not use third-party app UI as product base.
- Keep Markdown/frontmatter canonical where docs/memory are involved.
- No stubs, fake data, or deferred work.
- If a failure gate triggers, stop and report BLOCKED with exact command output and proposed fallback.

Required final report:
- Status: DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED.
- Changed files.
- TDD Evidence: RED command/result, GREEN command/result, and task gate command/result.
- Tests/commands run and pass/fail result.
- Exact dependency changes.
- Any plan/spec deviations.
- Any follow-up required before integration.
```

## Spec Review Prompt Template

Dispatch after implementer reports `DONE` or `DONE_WITH_CONCERNS`.

```text
You are the spec-compliance reviewer for one Fulcrum product-kernel task.

Review workspace:
[absolute worktree path]

Read:
- AGENTS.md
- docs/superpowers/specs/2026-04-30-product-kernel-research-design.md

Assigned task text:
[paste complete task text]

Implementer report:
[paste report]

Review scope:
- Confirm every task step and acceptance gate is satisfied.
- Confirm RED test evidence exists before implementation for every behavior change.
- Reject RED evidence that is only missing-module, syntax, or import failure.
- Confirm tests written after implementation are not being counted as TDD.
- Confirm no unrequested scope was added.
- Confirm failure gates were honored.
- Confirm constraints: no React unless explicitly in fallback, no embeddings/RAG/models, Markdown/frontmatter canonical, deterministic retrieval where relevant.
- Run focused tests when feasible.

Output:
- APPROVED or CHANGES_REQUIRED.
- Exact file/path/line findings.
- Missing requirements.
- Unrequested additions.
- Commands run.
```

Spec reviewer output `CHANGES_REQUIRED` means the implementer fixes in the same lane and the spec reviewer re-runs.

## Code Quality Review Prompt Template

Dispatch only after spec review is `APPROVED`.

```text
You are the code-quality reviewer for one Fulcrum product-kernel task.

Review workspace:
[absolute worktree path]

Read:
- AGENTS.md
- relevant touched files
- focused tests

Review scope:
- Correctness, maintainability, security, test quality, error handling, type safety, data migration safety, install/uninstall safety, and code-doc alignment.
- Confirm tests assert behavior and would fail on the old/missing implementation, not merely exercise implementation details.
- Check actual files and commands, not only implementer claims.
- Run focused tests when feasible.
- Do not expand scope.

Output:
- APPROVED or CHANGES_REQUIRED.
- Findings ordered by severity with exact file/path/line.
- Commands run.
- Residual risk.
```

Code-quality reviewer output `CHANGES_REQUIRED` means the implementer fixes in the same lane and the reviewer re-runs.

## Parent Integration Procedure

After both reviews approve:

- [ ] Inspect worker report.
- [ ] Inspect actual diff:

```bash
git -C <worktree> status --short
git -C <worktree> diff --stat
git -C <worktree> log --oneline --max-count=6
```

- [ ] Confirm RED/GREEN evidence is present for behavior work before merging.
- [ ] Apply or merge only the worker's owned paths into parent.
- [ ] Resolve shared files serially: `package.json`, `bun.lock`, `apps/cli/src/main.ts`, `README.md`, `HANDOVER.md`.
- [ ] Run focused gate for that task from parent.
- [ ] Run `git status --short` and `git diff --stat`.
- [ ] Mark the task complete in controller notes only after parent gate passes.

Do not mark task complete based on worker/reviewer text alone.

## Final Review

After Task 12 integrates, dispatch one final review agent.

Final reviewer scope:

- Spec coverage against the research/design spec.
- Plan coverage against all 12 product-kernel tasks.
- Deterministic retrieval policy.
- No React.
- No embeddings/RAG/model dependency.
- Local PGlite and PostgreSQL mode docs.
- Doctor/uninstall safety.
- Web/docs/CLI consistency.
- TDD evidence for every behavior task; missing RED evidence is a final-review failure.
- `bun run ci` result.

Parent then runs:

```bash
bun run ci
git status --short
git diff --stat
```

Completion requires CI green, final reviewer approval, and no unexplained dirty files.

## Stop Conditions

Stop and report to the user when:

- A fallback gate triggers and changes the chosen stack.
- A dependency license/runtime/platform concern appears.
- Product-kernel implementation would require embeddings/RAG/model dependency.
- Any task needs destructive cleanup outside known managed paths.
- A worker edits outside ownership and the change is not trivially discardable.
- Parent cannot reconcile shared-file changes without changing task scope.
