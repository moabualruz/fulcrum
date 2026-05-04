# Phase 03 — Pattern Map

**Purpose:** Existing analogs planner/executor should read before writing Phase 3 code.

## Conformance Harness

### Target files

- `src/orchestration/__tests__/symphony-conformance.test.ts`
- `docs/symphony-conformance.md`
- `.symphony-conformance.lock`
- `scripts/gen-conformance-trace.ts`
- `scripts/ci.ts`

### Closest analogs

- Existing conformance suite already uses `bun:test`, `createTestOrm()`, seeded `Task`/`AgentRun`, and direct imports from `src/orchestration/symphony/*`.
- Existing `fulcrum symphony conformance` command checks generated docs/lock against generator output.

### Pattern

- RED tests live beside orchestration code, not as manual docs.
- Generated trace is verified by exact file-content comparison.
- CI gate is named `symphony:conformance` in `scripts/ci.ts`.

## WORKFLOW.md Runtime

### Target files

- `src/orchestration/symphony/prompt.ts`
- `src/orchestration/symphony/schemas.ts`
- new `src/orchestration/symphony/workflow-runtime.ts`
- tests near `src/orchestration/symphony/*workflow*.test.ts`

### Closest analogs

- `parseWorkflowConfig()` uses `yaml` parser, `zod` strict schemas, and normalized camelCase internal config.
- `renderPrompt()` uses Liquid with `strictVariables` and `strictFilters`.

### Pattern

- Add typed error classes for each invalid input class.
- Keep external YAML snake_case where spec requires it; normalize to typed camelCase for internal use.
- Use structured expansion helpers for `$VAR` and `~`, not string replacement scattered through code.

## Native Tracker

### Target files

- `src/orchestration/symphony/tracker.ts`
- `src/orchestration/symphony/schemas.ts`
- `src/db/entities/tasks/Task.ts`
- `src/db/entities/orchestration/AgentRun.ts`

### Closest analogs

- `fetchCandidateIssues()` currently filters ready tasks, claimed/running/retry_queued runs, and unresolved blockers.
- `fetchIssuesByStates()` and `fetchIssueStatesByIds()` use MikroORM repository calls and Zod output parsing.

### Pattern

- Keep repository-based reads; no raw SQL in new app paths.
- Return strict Zod-parsed output from adapter boundary.
- Resolve blocker refs in a second batched query, then validate that every blocker ID has `{id, identifier, state}`.

## Orchestrator Lifecycle

### Target files

- `src/orchestration/symphony/dispatch.ts`
- `src/orchestration/symphony/orchestrator.ts`
- `src/orchestration/symphony/retry.ts`
- `src/orchestration/symphony/stall.ts`
- `src/orchestration/symphony/workspace.ts`
- `src/orchestration/symphony/hooks.ts`

### Closest analogs

- `claimRun()` uses a transaction plus `nativeUpdate()` as compare-and-swap.
- `scheduleRetry()` persists retry state and event rows.
- `scanForStalledRuns()` is injectable and testable with mocked clocks.
- `dispatchLifecycleHook()` supports hook timeouts.

### Pattern

- Keep side effects injected where practical for focused tests.
- Model state transitions with explicit from/to events.
- Prefer small exported lifecycle functions over expanding one large `tick()`.

## App-Server Client

### Target files

- new `src/orchestration/symphony/app-server-client.ts`
- new `src/orchestration/symphony/app-server-protocol.ts`
- new `src/orchestration/symphony/app-server-client.test.ts`

### Closest analogs

- `sandbox-runner.ts` demonstrates dependency injection for command execution, timeouts, provider selection, and persistence callbacks.
- `TranscriptWriter` and token/session helpers show persistence-oriented utilities.

### Pattern

- Build protocol fixtures first.
- Keep stderr separate from JSONL stdout stream.
- Track request IDs, thread IDs, turn IDs, timeout clocks, status notifications, approval/user-input states, token usage updates, and rate-limit events.

## Sandcastle And Agent Profiles

### Target files

- `src/orchestration/sandbox-runner.ts`
- `src/orchestration/types.ts`
- `src/agents/types.ts`
- `src/agents/profiles/*.ts`
- `src/agents/registry.ts`
- `src/doctor/*`

### Closest analogs

- `resolveProvider()` already gates Docker/Podman/cloud providers via `FULCRUM_FEATURES`.
- Agent profiles already share `AgentProfile` schema and `sandcastleProvider` values.
- Doctor route has subsystem checks including static Sandcastle check.

### Pattern

- Merge persisted profile defaults with `WORKFLOW.md` overrides at one boundary.
- Keep `noSandbox` default and warning.
- Make unsupported provider configuration fail clearly and show doctor warning.
- Adapter parity tests should use fake providers instead of real binaries.

## Artifacts, Session, Tokens

### Target files

- `src/orchestration/artifact-harvest-hook.ts`
- `src/artifacts/harvest.ts`
- `src/orchestration/session-resume.ts`
- `src/orchestration/token-tracking.ts`
- `src/db/entities/sandbox/Artifact.ts`
- `src/db/entities/sandbox/Edge.ts`
- `src/db/entities/orchestration/AgentRun.ts`

### Closest analogs

- Artifact harvest already copies matched files, persists Artifact rows, creates bidirectional edges, creates search previews, and records events.
- Session resume currently returns attempted/coldStart/transcriptPath.
- Token tracking currently accumulates profile regex matches.

### Pattern

- Extend existing utilities rather than replacing them.
- Add Codex app-server cumulative usage aggregation by `thread_id`; keep profile regex fallback for non-Codex agents.
- Session resume should be capability-declared per agent.

## Surfaces

### Target files

- `src/trpc/routers/orchestration.ts`
- `src/cli/commands/symphony.ts`
- `src/cli/symphony.ts`
- `src/tui/screens/orchestration.ts`
- `src/web/src/routes/orchestration/+page.server.ts`
- `src/web/src/lib/server/orchestration.ts`

### Closest analogs

- CLI commands already support `--json` and fake callers in tests.
- TUI screen already consumes caller abstraction and subscription bridge.
- Web page currently uses product DB helpers; new work should migrate dispatch actions through canonical tRPC/service path instead of adding new raw SQL.

### Pattern

- Add one canonical dispatch procedure and have CLI/Web/TUI call it.
- Surface tests use fake callers/provider fakes.
- Keep outputs machine-readable on CLI with `--json`.

