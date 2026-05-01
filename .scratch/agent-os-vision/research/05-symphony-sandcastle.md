# Deep-Dive: OpenAI Symphony + mattpocock/sandcastle

**Date:** 2026-05-01
**Purpose:** Evaluate both repos for Fulcrum integration; determine submodule strategy for Symphony and orchestration role for Sandcastle; surface required changes to the master plan.

---

## Repo: OpenAI Symphony

### What it is

Symphony is a specification-driven orchestration daemon that turns issue-tracker work items into isolated, autonomous coding-agent execution runs. It polls a tracker (currently Linear), claims eligible issues, spawns a coding agent (Codex app-server, or any app-server-protocol-compatible agent) in a per-issue workspace, drives multi-turn agent sessions, handles retries with exponential backoff, reconciles running state against the tracker, and manages workspace lifecycle via hook scripts — all without human supervision. The spec is language-agnostic; OpenAI ships an Elixir reference implementation plus a comprehensive `SPEC.md` that anyone can implement in any runtime.

### Status / maturity

- **Stars:** 20,200 — high signal for an engineering-preview repo
- **Forks:** 1,700
- **Last commit:** active as of research date (May 2026)
- **Releases:** none published (no semver tags) — this is intentional: it is an **engineering preview**
- **README says:** "low-key engineering preview for testing in trusted environments"

**Verdict: bet with eyes open.** The SPEC.md is production-quality — 40+ pages of data-models, state machines, error categories, conformance checklists, and test matrices. The absence of release tags is intentional (spec-driven, impl-independent). The 20k-star adoption signals OpenAI is treating this as their canonical pattern for agentic dev workflows. Risk: spec may revise; no semver guarantees. Mitigation: track as a submodule pinned to `main` and gate Fulcrum's conformance in CI.

### License

Apache-2.0

### Language / runtime

Elixir (reference implementation, 95.5% of repo). The spec itself is language-agnostic; Fulcrum would implement against the spec in TypeScript, not import the Elixir code.

### Core concepts — every named primitive

| Primitive | Gloss |
|-----------|-------|
| **Issue** | Work unit from tracker: `id`, `identifier`, `title`, `description`, `priority`, `state`, `branch_name`, `labels`, `blocked_by`, timestamps |
| **Workflow Definition** | `WORKFLOW.md` file: YAML front-matter (`config`) + Markdown prompt body (`prompt_template`) |
| **Service Config** | Typed view of the YAML front-matter: `tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`, optional `server` |
| **Workspace** | Per-issue directory under `workspace.root`; key sanitized to `[A-Za-z0-9._-]` only |
| **Run Attempt** | One execution of an agent against one issue: `issue_id`, `attempt`, `status`, phases enum |
| **Live Session** | Active agent session metadata: `session_id = "<thread_id>-<turn_id>"`, token counters, stall tracking |
| **Retry Entry** | Scheduled re-run: `issue_id`, `attempt` (1-based), `due_at_ms`, exponential delay |
| **Orchestrator Runtime State** | In-memory authority: `running` map, `claimed` set, `retry_attempts` map, `completed` set, aggregate token/time counters |
| **Issue Orchestration States** | `Unclaimed → Claimed → Running / RetryQueued → Released` |
| **Run Attempt Phases** | `PreparingWorkspace → BuildingPrompt → LaunchingAgentProcess → InitializingSession → StreamingTurn → Finishing → Succeeded/Failed/TimedOut/Stalled/CanceledByReconciliation` |
| **Workspace Hooks** | `after_create`, `before_run`, `after_run`, `before_remove` — shell scripts with timeout |
| **Prompt Template** | Liquid-compatible strict renderer; variables: `issue` (object), `attempt` (null or int) |
| **App-Server Client** | Subprocess protocol client (Codex app-server stdio protocol); issues turns, extracts thread/turn IDs |
| **`linear_graphql` Tool** | Optional extension: lets the agent call Linear GraphQL mutations directly via Symphony's auth |
| **HTTP Server Extension** | Optional: `GET /`, `GET /api/v1/state`, `GET /api/v1/<identifier>`, `POST /api/v1/refresh` |
| **SSH Worker Extension** | Optional: remote workspace execution via SSH stdio; single orchestrator, distributed hosts |

### File structure — what we'd check against

```
vendor/openai-symphony/
├── SPEC.md          ← the formal contract; ~40-page machine-readable specification
├── README.md        ← overview + prerequisites
├── LICENSE          ← Apache-2.0
├── NOTICE
├── elixir/          ← reference implementation (Elixir; we don't use this directly)
│   └── README.md
└── .codex/          ← Codex config for the Elixir impl
```

The only file Fulcrum needs to check against continuously is **`SPEC.md`**. The Elixir code is a reference, not a dependency.

### Integration story for Fulcrum

**Submodule path:** `vendor/openai-symphony/`

```bash
git submodule add https://github.com/openai/symphony.git vendor/openai-symphony
git submodule update --remote --merge  # update to latest main
```

**Sync policy:** `git submodule update --remote --merge vendor/openai-symphony` on a schedule. Recommended: weekly CI job (`just sync-symphony`) that runs the update, diffs `SPEC.md` against the previous pinned version using `difft`, and opens a PR if the diff is non-empty. Human reviews the diff, updates Fulcrum's implementation to match, merges. This keeps the submodule HEAD at upstream main while ensuring no silent spec drift.

**How we surface conventions in the codebase:**

**Option 3 — Test gates** is the right choice here. Symphony's spec defines conformance requirements explicitly (§Validation & Test Matrix) with a required vs. extension split. The implementation path is:

1. Fulcrum implements Symphony's orchestration primitives in TS (see §"What it CHANGES" below).
2. A CI step (`just test:symphony-conformance`) runs a test suite that exercises each REQUIRED section of `SPEC.md`:
   - Workspace sanitization invariants
   - State-machine transitions (Unclaimed → Running → Released)
   - Retry backoff formula: `min(10000 * 2^(attempt-1), max_retry_backoff_ms)`
   - Poll loop ordering (priority asc → created_at asc → identifier lex)
   - Prompt template rendering (strict mode: unknown variable = error)
   - Hook timeout enforcement
   - Stall detection: `elapsed_ms > stall_timeout_ms` → retry
3. A `docs/symphony-conformance.md` traces each REQUIRED checklist item to the Fulcrum file that implements it — the spec is the source of truth, the trace is the human-readable map.

TypeScript types generated from Symphony's schema (Option 1) would be cleaner but there are no machine-readable schemas in the repo — only prose spec. Runtime Zod validation (Option 2) is appropriate for config parsing (the WORKFLOW.md front-matter schema), not for behavioral conformance.

### What it CHANGES in the master plan

**Pillars hit:**

| Vision pillar (from VISION-GAPS.md) | Change forced |
|-------------------------------------|---------------|
| **Agent orchestration + manual assign** | Symphony defines the canonical model: poll tracker → claim issue → run agent in isolated workspace → retry on failure. Fulcrum's orchestration layer must conform to this state machine, not invent a bespoke one. |
| **Auto-orchestration (auto-assign by task type/criteria)** | Symphony's `WORKFLOW.md` + priority/state-based dispatch IS the routing model for issue→agent. The json-rules-engine auto-router from stream-3 becomes a pre-dispatch filter, not the primary orchestration authority. |
| **Repo supervision** | Symphony's workspace model (one dir per issue, per-issue git checkout) defines how repos are managed during agent runs. Fulcrum's `repos` table must link to Symphony workspaces. |
| **Memory / context bridge into agent runs** | Symphony's `before_run` hook and prompt template are the injection points for memory/context. The context assembly pipeline (Mastra RAG + retriever.ts) must output into the WORKFLOW.md prompt template variables, not a separate system. |
| **Artifacts** | Symphony produces artifacts as side-effects inside workspaces; `after_run` hook is where Fulcrum would harvest and index them. |

**Conflicts with stream-3 picks:**

- **Mastra orchestration vs. Symphony state machine:** Mastra's workflow graph (step → branch → parallel) is a general-purpose agent workflow engine. Symphony defines a *specific* orchestration model: single-authority in-memory state, poll loop, claim/release semantics, tracker-driven reconciliation. These are not redundant. Symphony defines WHAT the orchestration does and its behavioral contracts; Mastra could implement some of the steps inside the worker (the multi-turn agent loop), but the outer orchestration loop (poll, claim, reconcile, retry) should be implemented natively per spec, not shimmed through Mastra's workflow DSL. Mastra stays for: defining agent capabilities, tool registries, memory backends, RAG. Symphony replaces: the custom orchestration loop that stream-3 planned to bolt onto Mastra.
- **Linear tracker integration:** Symphony currently requires Linear. Fulcrum targets its own internal task system (PGlite tasks table). The tracker adapter interface in Symphony (§Issue Tracker Integration) is pluggable — Fulcrum must implement a `fulcrum-tracker` adapter that speaks Symphony's three required operations (`fetch_candidate_issues`, `fetch_issues_by_states`, `fetch_issue_states_by_ids`) against its own PGlite tables instead of Linear. This is the biggest custom work item.
- **graphile-worker job queue:** Symphony's orchestration is a polling loop, not a queue-per-job architecture. The graphile-worker pick from stream-3 is still valid for background tasks (doc indexing, embedding, etc.) but is NOT the mechanism for Symphony's issue dispatch loop. Symphony uses in-memory state with a timer-based poll tick; graphile-worker handles everything else.

### Failure gates

Abandon Symphony (fall back to custom orchestration loop) if:
1. SPEC.md undergoes breaking revision that is incompatible with Fulcrum's tracker model and the adaptation work exceeds 2 dev-weeks.
2. OpenAI deprecates the spec or moves to a closed implementation.
3. The Codex app-server protocol changes in a way that breaks Symphony's agent client contract AND Claude Code's app-server doesn't publish a compatible protocol.

**Second choice:** Custom orchestration loop conforming to the SAME behavioral contracts (poll, claim, retry, reconcile, hooks) but without the Linear dependency and without the Codex app-server requirement — essentially, Fulcrum's own implementation of the spec patterns but not branded as Symphony-conformant.

### Open questions for the user

1. **Tracker adapter scope:** Symphony is Linear-native. Fulcrum's issues live in PGlite. Do we (a) integrate Linear as a first-class tracker so Symphony can drive real Linear tickets, or (b) implement a Fulcrum-native tracker adapter so Symphony drives Fulcrum's own tasks? Option (a) means Fulcrum's kanban IS Linear. Option (b) means Fulcrum is self-contained. This is a product-direction question that affects the entire task management pillar.
2. **Codex app-server vs. Claude app-server:** Symphony's agent client speaks the Codex app-server stdio protocol. Claude Code also supports an app-server mode. Are these protocols compatible, or does Fulcrum need to implement a protocol adapter layer for Claude Code vs. Codex?

---

## Repo: mattpocock/sandcastle

### What it is

Sandcastle is a TypeScript library (`@ai-hero/sandcastle` on npm, v0.5.6) for orchestrating AI coding agents — specifically Claude Code, Codex, Pi CLI, OpenCode — in isolated sandbox environments. It handles sandbox lifecycle (Docker, Podman, Vercel, Daytona, or no-sandbox), git worktree creation, branch strategy (direct, merge-to-head, or named branch), multi-iteration agent loops, completion signal detection, session capture and resumption, and lifecycle hooks — all from a single `sandcastle.run()` call. It is built on the Effect framework for typed async concurrency and provides a CLI (`sandcastle init`, `sandcastle docker/podman build-image`).

### Status / maturity

- **Stars:** 2,300
- **Forks:** 191
- **Latest release:** v0.5.6 (April 29, 2026) — pre-1.0 but actively released
- **Release cadence:** frequent patch/minor releases (Changesets-managed CHANGELOG)
- **Package:** `@ai-hero/sandcastle` on npm; properly typed (`dist/index.d.ts`); named exports per sandbox provider

**Verdict: early but usable.** Pre-1.0 means API is not frozen. The author (Matt Pocock) is a credible TypeScript community figure; his repos are generally well-maintained. The Effect dependency is a significant bet — Effect is a powerful but opinionated TS runtime that has a steep learning curve and is not universally loved. Risk: breaking API changes before 1.0; Effect version churn. Mitigation: pin to a specific version, wrap Sandcastle behind a Fulcrum adapter interface so swapping is contained.

### License

MIT

### Language / runtime

TypeScript (99.8%), Node.js v22 (default Dockerfile). Uses Effect (`effect`, `@effect/platform`, `@effect/platform-node`, `@effect/cli`) as its concurrency/IO runtime.

### Core concepts — every named primitive

| Primitive | Gloss |
|-----------|-------|
| **`sandcastle.run()`** | Single-call agent execution: creates sandbox, runs agent, merges result, tears down |
| **`createSandbox()`** | Reusable sandbox handle for multiple sequential agent runs |
| **`createWorktree()`** | Isolated git worktree lifecycle (create, use, discard) |
| **`interactive()`** | TUI mode for manual exploration inside a sandbox |
| **Agent providers** | `claudeCode()`, `pi()`, `codex()`, `opencode()` — each wraps a CLI agent with configurable effort levels |
| **Sandbox providers** | `docker()`, `podman()`, `vercel()`, `daytona()`, `noSandbox()` — pluggable isolation backends |
| **Custom sandbox providers** | `createBindMountSandboxProvider()`, `createIsolatedSandboxProvider()` — extension points |
| **Branch strategy** | `head` (direct write), `merge-to-head` (temp branch auto-merged), `branch` (named persistent branch) |
| **Sandbox handle** | Per-sandbox object: `exec()`, `copyFileIn/Out()`, `copyIn()`, `worktreePath`, `close()` |
| **Prompt** | Inline string, file reference, shell command interpolation (`` !`cmd` ``), `{{KEY}}` placeholder substitution; built-in `{{SOURCE_BRANCH}}`, `{{TARGET_BRANCH}}` |
| **Completion signal** | `<promise>COMPLETE</promise>` tag (customizable) that terminates agent iteration loop early |
| **Session capture** | Claude Code iteration state persisted to `~/.claude/projects/<path>/sessions/` for resumption |
| **`resumeSession`** | Restore prior Claude Code session from JSONL file |
| **Hooks** | `onWorktreeReady`, `onSandboxReady` — segregated by host vs. sandbox context; parallel or sequential ordering |
| **`.sandcastle/` directory** | Project config: `Dockerfile`/`Containerfile`, `prompt.md`, `.env.example`, `.gitignore`, `main.ts`, `logs/` |
| **Timeout defaults** | Idle: 600s; per-hook: 60s; `copyToWorktree`: 120s |
| **Environment resolution** | `.sandcastle/.env` → `process.env` → provider `env` object; provider-level overrides win |

### File structure — what we'd use

Sandcastle is an npm dependency, not a submodule. The relevant files for Fulcrum:

```
# In consuming project (Fulcrum):
.sandcastle/
├── Dockerfile          ← sandbox image definition
├── prompt.md           ← base prompt template
├── .env.example        ← env var documentation
└── main.ts             ← orchestration script using sandcastle.run()

# npm dep:
node_modules/@ai-hero/sandcastle/
├── dist/index.js
├── dist/index.d.ts
├── dist/sandboxes/docker.js
├── dist/sandboxes/vercel.js
├── dist/sandboxes/podman.js
└── dist/sandboxes/daytona.js
```

### Integration story for Fulcrum

**Integration path:** Direct npm dependency, pinned to exact version.

```bash
bun add @ai-hero/sandcastle@0.5.6
```

**Keep in sync:** Dependabot or Renovate PR on minor/patch bumps; human review of CHANGELOG before merge; hold at current major until 1.0 released.

**How we surface its conventions:**

**Option 1 — Compile-time checks** is the right choice. Sandcastle ships TypeScript types (`dist/index.d.ts`). Fulcrum's orchestration code that calls `sandcastle.run()` gets full type safety at build time. The Effect-based runtime types propagate through. No extra test gate needed beyond passing tsc + existing tests.

Additionally: Fulcrum wraps Sandcastle behind `src/orchestration/sandbox-runner.ts` — a typed adapter that normalizes Sandcastle's API surface into Fulcrum's own `AgentRun` interface. This means if Sandcastle breaks API, only the adapter changes, not every call site.

**Orchestration patterns Fulcrum would use immediately:**

- `sandcastle.run({ agent: claudeCode(), sandbox: docker(), branch: 'merge-to-head' })` — for each task dispatch
- `createSandbox()` for sequential implement → review agent pairs on the same container state
- Multiple `createWorktree()` calls with centralized merge for parallel agent task completion
- `resumeSession` for retry continuation (directly analogous to Symphony's continuation retry)

### What it CHANGES in the master plan

**Relationship to Mastra:** Sandcastle is NOT the same layer as Mastra. Mastra defines agents, tools, memory backends, and workflows at the semantic level. Sandcastle handles the execution infrastructure — sandbox isolation, git worktrees, branch strategy, agent process lifecycle. They are complementary:

```
Mastra         → WHAT agents do (tools, memory, workflow steps)
Sandcastle     → HOW agents run (container, worktree, branch, iteration loop)
Symphony SPEC  → WHEN and WHY agents are dispatched (issue tracker, orchestration policy)
```

**Does Sandcastle REPLACE Mastra?** No. It operates at a different layer. Sandcastle replaces the "figure out how to run a coding agent in isolation" custom work that stream-3 left as a must-write item. It does NOT replace Mastra's agent definition, memory, or workflow graph capabilities.

**What it makes redundant or simpler:**

| Stream-3 planned must-write | Sandcastle status |
|-----------------------------|-------------------|
| Custom sandbox/container management | Replaced — Sandcastle handles Docker/Podman/Vercel lifecycle |
| Git worktree management | Replaced — `createWorktree()` handles create/use/teardown |
| Agent iteration loop with completion detection | Replaced — `sandcastle.run()` with `<promise>COMPLETE</promise>` |
| Session capture for retry | Replaced — built-in session JSONL persistence |
| Branch strategy per task type | Replaced — `head`/`merge-to-head`/`branch` config |

**What it does NOT cover (still must-write or covered by Mastra):**

- Memory retrieval and context assembly before agent runs
- Task routing / auto-assignment (auto-router from stream-3 still needed)
- The Symphony orchestration loop (poll, claim, reconcile, retry timers)
- Agent capability registry (which agents have which tools/permissions)

**Vision pillars hit:**

| Vision pillar (from VISION-GAPS.md) | Change forced |
|-------------------------------------|---------------|
| **Agent orchestration + manual assign** | Sandcastle provides the run primitive; Fulcrum's UI "assign to agent" button calls `sandcastle.run()` with the chosen provider |
| **"Personal AND AI agent projects, no distinction"** | Sandcastle's provider abstraction (`claudeCode()`, `codex()`, `pi()`) makes any CLI agent first-class; user and AI agent runs use the same `sandcastle.run()` interface |
| **Repo supervision** | Sandcastle's worktree model maps directly to per-repo branch supervision; `worktreePath` is the supervision target |
| **Artifacts** | `sandbox.exec()` + `copyFileOut()` is the artifact harvest mechanism from agent runs |

**Effect dependency risk:** Sandcastle requires `effect` as a peer dependency. Effect is a complete TS runtime (typed errors, fibers, streams). If Fulcrum's other deps conflict with Effect's version, this becomes a resolution problem. Check: Mastra does not use Effect internally; the two can coexist as long as Effect is only in Sandcastle's dependency tree and not pulled into Fulcrum's core modules.

### Failure gates

Abandon Sandcastle if:
1. API breaks before 1.0 in a way that requires rewriting the adapter layer more than twice in 3 months.
2. Effect dependency conflicts with Mastra or PGlite in Bun's module resolution.
3. Docker/Podman is not available in the target deployment environment AND Vercel/Daytona are the only viable sandboxes (those are cloud-only, breaking local-first constraint).

**Second choice:** Direct `Bun.spawn()` of agent CLI processes + custom worktree management using `simple-git` npm package + manually implement the branch/merge strategy. More code, same outcome. Estimated: ~400 LOC of `must-write` work vs. ~50 LOC with Sandcastle.

### Open questions for the user

1. **Docker requirement for local-first:** Sandcastle's sandbox isolation requires Docker or Podman locally (or runs in `noSandbox` mode, which writes directly to the host filesystem). Is Docker a required prerequisite for Fulcrum's local install, or must Fulcrum work without it? If Docker is optional, `noSandbox` mode is the fallback, which reduces isolation guarantees.
2. **Effect framework appetite:** Sandcastle brings in the entire Effect ecosystem. Is the team comfortable with Effect as a dependency, or does this add unacceptable learning/debugging overhead for contributors?

---

## Synthesis

### Are Symphony and Sandcastle complementary or overlapping?

**Complementary — no overlap.** They operate at different abstraction levels:

- **Symphony SPEC** = orchestration policy and lifecycle management (WHEN to run agents, which issues, retry logic, tracker integration, workspace naming, hook contracts).
- **Sandcastle** = execution infrastructure (HOW to run a single agent invocation: container, worktree, branch, iteration, session capture).

Symphony's "Worker Attempt" (steps: create workspace → run before_run hook → launch agent → stream turns → after_run hook) maps directly onto Sandcastle's `sandcastle.run()`. Symphony defines the outer loop; Sandcastle implements the inner execution primitive.

The complete picture with all three adopted:

```
┌─────────────────────────────────────────────────────────────┐
│  Symphony Orchestration Loop (Fulcrum TS implementation)    │
│  Poll tracker → Claim issue → Dispatch → Reconcile → Retry  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Mastra Agent Definitions                             │  │
│  │  (tools, memory backends, RAG, agent capabilities)   │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │                                   │
│  ┌────────────────────── ▼ ──────────────────────────────┐  │
│  │  Sandcastle Execution Layer                           │  │
│  │  sandcastle.run({ agent: claudeCode()/codex(),        │  │
│  │    sandbox: docker(), branch: 'merge-to-head' })      │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼────────────────────────────────┐  │
│  │  PGlite + pgvector + graphile-worker                  │  │
│  │  (tasks, memories, agent_runs, artifacts, job queue)  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Changes to in-flight stack picks

| Current pick (stream-3) | Change with Symphony + Sandcastle |
|-------------------------|-----------------------------------|
| **Mastra** for agent orchestration loop | UNCHANGED — Mastra stays for agent definitions and memory; the outer orchestration loop is replaced by Symphony spec implementation |
| **Custom `src/orchestration/` code** (must-write) | Scoped to: (a) Symphony TS implementation, (b) Fulcrum tracker adapter for Symphony |
| **graphile-worker** as job queue | Stays for background tasks; Symphony's poll loop is a separate in-memory timer loop (not queue-per-job) |
| **`src/router/auto-assign.ts`** (must-write) | Still needed as a pre-dispatch filter (decides which agent type for a given issue), but the orchestration loop itself is Symphony |
| **Docker/container management** (no prior plan) | Replaced by Sandcastle — no custom work needed |
| **Git worktree management** (no prior plan) | Replaced by Sandcastle's `createWorktree()` |
| **Session resumption for retries** (no prior plan) | Replaced by Sandcastle's `resumeSession` |

### Submodule / vendoring policy Fulcrum needs

**Symphony: git submodule tracked to upstream main.**

```bash
# Initial setup
git submodule add https://github.com/openai/symphony.git vendor/openai-symphony

# justfile recipe — run weekly or on-demand
sync-symphony:
    git submodule update --remote --merge vendor/openai-symphony
    difft HEAD:vendor/openai-symphony/SPEC.md vendor/openai-symphony/SPEC.md || true

# CI gate
test-symphony-conformance:
    bun test src/orchestration/__tests__/symphony-conformance.test.ts
```

The submodule pointer in `.gitmodules` always tracks `branch = main`. After each `update --remote`, CI diffs `SPEC.md`, runs conformance tests, and fails the build if a REQUIRED spec item is now unimplemented. This is the "keep checking against as a submodule" intent operationalized.

**Sandcastle: npm dependency, version-pinned.**

```json
{ "@ai-hero/sandcastle": "0.5.6" }
```

Renovate/Dependabot opens PRs on patch/minor bumps. Fulcrum's adapter layer (`src/orchestration/sandbox-runner.ts`) insulates call sites from API churn. Hold at current major until 1.0.

### The single biggest change to the plan

**The orchestration layer is now two things, not one.** Stream-3 planned to bolt orchestration logic onto Mastra as a workflow graph. With Symphony adopted, the orchestration layer splits:

- **Outer loop:** Symphony state machine (poll, claim, run, reconcile, retry) — implemented in TS conforming to `SPEC.md`. The CRITICAL new must-write is the **Fulcrum tracker adapter** — three GraphQL-style operations against PGlite instead of Linear. Without this adapter, Symphony cannot drive Fulcrum's own tasks.
- **Inner execution:** Sandcastle `sandbox-runner.ts` adapter — replaces ~400 LOC of custom container/worktree/session code.

This reshapes `src/orchestration/` from a flat Mastra extension into a layered module:

```
src/orchestration/
├── symphony/          ← Symphony state machine implementation
│   ├── orchestrator.ts    (poll loop, claim, reconcile, retry)
│   ├── workspace.ts       (per-issue dir, sanitization, hooks)
│   ├── tracker.ts         (interface + fulcrum-pglite adapter)
│   └── prompt.ts          (Liquid template renderer, strict mode)
├── sandbox-runner.ts  ← Sandcastle adapter (sandcastle.run() wrapper)
└── auto-assign.ts     ← json-rules-engine + LLM Haiku router (unchanged from stream-3)
```

### The 2 gray areas needing user input most urgently

**1. Tracker adapter direction (Symphony §Tracker Integration):** Symphony assumes Linear. Fulcrum has its own task DB (PGlite). The choice is: (a) Fulcrum's tasks ARE the tracker, Symphony drives them (self-contained product, no Linear dependency), or (b) Linear is a required peer dependency for Symphony to function (Fulcrum becomes a Linear-powered product). This is a fundamental product-direction decision — it determines whether Fulcrum's built-in kanban is the source of truth for agent dispatch or whether users must have a Linear account.

**2. Docker requirement (Sandcastle §Integration):** Sandcastle's isolation model assumes a container runtime. `noSandbox` mode exists but writes directly to the host filesystem (risk: agent side-effects outside worktree). The question is whether Fulcrum's local-first install requires Docker as a prerequisite, or whether `noSandbox` is the default with Docker as opt-in enhancement. This affects the install story, the security posture documentation (Symphony SPEC §Security §Trust Boundary Assumption), and the `fulcrum doctor` health checks.

---

*Sources: `github.com/openai/symphony` (README, SPEC.md); `github.com/mattpocock/sandcastle` (README, package.json); `.scratch/agent-os-vision/VISION-GAPS.md`; `.scratch/agent-os-vision/research/03-orchestration-memory-skills.md`*
