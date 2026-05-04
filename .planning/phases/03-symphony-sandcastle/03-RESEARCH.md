# Phase 3: Symphony + Sandcastle - Research

**Date:** 2026-05-04
**Phase:** 03-symphony-sandcastle
**Question:** What does planner need to know to plan full Symphony conformance plus Sandcastle dispatch?

## RESEARCH COMPLETE

## Executive Summary

Phase 3 should be planned as a conformance-first orchestration build, not as a surface feature build. Existing code already has useful scaffolding in `src/orchestration/symphony/`, `src/orchestration/sandbox-runner.ts`, `src/db/entities/orchestration/AgentRun.ts`, and `src/db/entities/sandbox/`, but the current shape is only a partial conformance skeleton:

- `WORKFLOW.md` parsing currently handles a narrow config subset and DB-backed workflow definitions, not runtime file path precedence, full front matter, app-server policy fields, server extension config, `$VAR`/`~` expansion, or dynamic reload.
- Native tracker currently exposes `CandidateIssue`/`AgentRunIssue` rows, but it does not return the full Symphony 12-field Issue object, description, branch name, URL, labels, or full `blocked_by` refs.
- Dispatch loop exists as injectable `tick()` but lacks full reconcile -> validate -> fetch -> sort -> dispatch -> notify sequence, continuation retry semantics, per-state concurrency, complete run-attempt lifecycle, and app-server event handling.
- Sandcastle runner already supports provider selection, transcripts, diffs, artifacts, token tracking, and session resume concepts, but token tracking is profile regex based rather than Codex `thread/tokenUsage/updated`, and session resume is transcript-path based rather than app-server `thread/resume` for Codex.
- Web/CLI/TUI orchestration surfaces exist, but some still use product-kernel/raw SQL paths. Phase 3 plans must preserve Phase 1/2 architecture constraints and route new work through tRPC/services/MikroORM.

Planning should break the phase into RED-first conformance slices with hard gates, then add dispatch surfaces and provider parity after the core runner/state machine is stable.

## Canonical Specs And Current External Facts

### OpenAI Symphony

`vendor/openai-symphony/SPEC.md` is the phase source of truth. Important anchors:

- §7.1 defines issue orchestration states: Unclaimed, Claimed, Running, RetryQueued, Released.
- §7.2 defines run attempt lifecycle: PreparingWorkspace, BuildingPrompt, LaunchingAgentProcess, InitializingSession, StreamingTurn, Finishing, then terminal.
- §17.1-17.7 define required deterministic conformance tests.
- §18.1 lists core required conformance items. Phase 3 must cover every item.
- §13.7 HTTP server extension is optional in upstream spec, but Phase 3 success criteria require it, so treat as in-scope extension.

### Codex app-server

Official Codex app-server docs state:

- `codex app-server` is for deep product integrations; CI/job automation should generally use Codex SDK, but Symphony specifically requires app-server protocol integration for this phase.
- Supported transports include default stdio JSONL and experimental WebSocket; stdio is the correct target for deterministic local integration.
- JSON-RPC messages use `method`, `params`, and `id`; notifications omit `id`.
- `thread/start` accepts fields including `model`, `cwd`, `approvalPolicy`, `sandbox`, `personality`, and `serviceName`.
- `thread/resume` continues a stored session by recorded `thread.id`; it accepts similar configuration overrides.
- `thread/status/changed` exposes active flags such as `waitingOnApproval`.
- `command/exec` uses a `sandboxPolicy` shape and can stream stdout/stderr.

Sources:

- [OpenAI Codex App Server docs](https://developers.openai.com/codex/app-server)
- `vendor/openai-symphony/SPEC.md` sections 10.4-10.5, 17.5.

## Existing Implementation Map

### WORKFLOW.md And Prompt

Files:

- `src/orchestration/symphony/prompt.ts`
- `src/db/entities/orchestration/WorkflowDefinition.ts`
- `src/db/repositories/orchestration/WorkflowDefinitionRepository.ts`

Current state:

- `parseWorkflowConfig()` parses YAML into `WorkflowConfig` with `stallTimeoutMs`, `maxRetryBackoffMs`, `keepOnFailure`, and `maxAttempts`.
- `renderPrompt()` uses Liquid with strict variables and filters.
- `loadWorkflowDef()` reads DB workflow definitions by org/project/name.

Planning implication:

- Add filesystem runtime loader separate from DB workflow definition storage.
- Keep strict render behavior; extend accepted config schema instead of replacing it.
- Need typed errors for missing workflow file, invalid YAML, non-map front matter, invalid config, unknown variables/filters.
- Need reload manager that stores last-good effective config and emits operator-visible errors.

### Tracker Adapter

Files:

- `src/orchestration/symphony/tracker.ts`
- `src/orchestration/symphony/schemas.ts`
- `src/db/entities/tasks/Task.ts`
- `src/db/entities/orchestration/AgentRun.ts`

Current state:

- `fetchCandidateIssues()` finds ready tasks, excludes occupied task IDs, checks `blockedByIds`, sorts by priority then creation, returns simplified candidates.
- `fetchIssuesByStates()` returns run rows by orchestration state.
- `fetchIssueStatesByIds()` returns slim state rows.
- Candidate issue currently uses task ID as `identifier` and `title` placeholder.

Planning implication:

- Introduce a normalized Symphony `Issue` schema with all 12 fields required by SYM-05 and prompt rendering.
- Resolve `blocked_by` into full refs `{id, identifier, state}` and fail tests for missing blockers.
- Preserve `agent_runs.orchestration_state` as mutable authority.
- External connectors should remain ingest-only and should not enter dispatch path.

### Orchestrator, Retry, Stall, Workspace

Files:

- `src/orchestration/symphony/dispatch.ts`
- `src/orchestration/symphony/orchestrator.ts`
- `src/orchestration/symphony/retry.ts`
- `src/orchestration/symphony/stall.ts`
- `src/orchestration/symphony/workspace.ts`
- `src/orchestration/symphony/hooks.ts`

Current state:

- `tick()` handles capacity, fetch, claim, transition to running, workspace, prompt, hooks, runner, final success/failure.
- `claimRun()` uses MikroORM native update plus DB uniqueness guard.
- `scheduleRetry()` implements 10s exponential backoff with cap.
- `scanForStalledRuns()` checks `startedAt`; it does not yet prefer `last_codex_timestamp`.
- Hooks exist and include timeout resolution.

Planning implication:

- Split dispatch state machine into smaller lifecycle functions to avoid a giant `tick()`.
- Add reconcile step before fetch and per-tick running-state refresh.
- Add continuation retry after normal worker exit with 1000ms fixed delay.
- Add failure retry path separate from normal continuation.
- Add `last_codex_timestamp` persistence and stall source selection.
- Add run-attempt lifecycle state storage without confusing it with issue orchestration state.

### App-Server Client

Likely new files:

- `src/orchestration/symphony/app-server-client.ts`
- `src/orchestration/symphony/app-server-protocol.ts`
- `src/orchestration/symphony/app-server-client.test.ts`

Current state:

- No first-class Codex app-server JSONL client exists.
- Sandcastle runner can shell out through generic CLI profiles, but that is not equivalent to Symphony app-server conformance.

Planning implication:

- Add protocol-level unit tests before implementation.
- Use fake child process streams in tests.
- Client must handle request/response IDs, notifications, thread/turn extraction, read timeout, turn timeout, stderr separation, approval/user-input/rate-limit/usage event interpretation, and clean termination.
- Persist `thread_id`, `turn_id`, `session_id`, `last_codex_timestamp`, and cumulative token usage.

### Sandcastle Runner

Files:

- `src/orchestration/sandbox-runner.ts`
- `src/orchestration/types.ts`
- `src/agents/types.ts`
- `src/agents/profiles/*.ts`
- `src/orchestration/artifact-harvest-hook.ts`
- `src/artifacts/harvest.ts`
- `src/orchestration/session-resume.ts`
- `src/orchestration/token-tracking.ts`

Current state:

- Supports `noSandbox`, Docker, Podman, Vercel, Daytona, Modal, E2B selection by feature flags.
- Modal/E2B are placeholders because `@ai-hero/sandcastle` 0.5.6 does not expose drivers.
- Default host mode warns with trust-boundary warning.
- Artifacts use comma-separated glob matching with default `dist/**,build/**,*.patch,*.diff`.
- Session resume currently resolves prior transcript path and appends prompt text.
- Token tracking currently parses agent stdout using profile regex when `token-tracking` flag is enabled.

Planning implication:

- Separate Sandcastle provider capability from app-server Codex path. Both must write same `AgentRun` result contract.
- Keep `noSandbox` default and warning.
- Add doctor checks for configured providers.
- Document unsupported cloud-provider driver behavior explicitly: configured provider may fail clearly if package lacks driver.
- Add profile/WORKFLOW merge for per-agent command/model/policy/sandbox.
- Extend token accounting for Codex app-server events while keeping profile regex fallback for non-Codex agents.

### Surfaces

Files:

- `src/trpc/routers/orchestration.ts`
- `src/cli/commands/symphony.ts`
- `src/cli/symphony.ts`
- `src/tui/screens/orchestration.ts`
- `src/web/src/routes/orchestration/+page.server.ts`
- `src/web/src/lib/server/orchestration.ts`

Current state:

- tRPC router mixes product-kernel calls and newer ORM-backed Symphony functions.
- CLI has more than one Symphony command implementation surface.
- TUI screen can list state but has limited dispatch action shape.
- Web page still uses raw product DB helpers.

Planning implication:

- Phase 3 must include surface dispatch e2e because user selected spec conformance plus surface parity gate.
- New dispatch APIs should be canonical tRPC/service paths, then CLI/Web/TUI consume them.
- Avoid adding more product-kernel raw SQL paths.

## Recommended Plan Shape

Plan Phase 3 in dependency waves:

1. **Conformance test harness and schema contracts**
   - RED-first §17/§18 coverage, trace generation hard gate, normalized Issue schema, app-server protocol fixture tests.

2. **WORKFLOW.md runtime contract**
   - File path precedence, YAML front matter/body split, typed config, env/path expansion, strict prompt rendering, reload last-good behavior, approval/sandbox docs.

3. **Native tracker + state machine**
   - Full issue model, blocked refs, candidate sort/eligibility, reconcile before dispatch, state refresh, per-state concurrency, run-attempt lifecycle.

4. **Codex app-server client + token/session telemetry**
   - JSONL protocol, start/resume/thread/turn IDs, event streaming, timeouts, approval/user-input non-stall policy, token aggregation by thread.

5. **Sandcastle provider + agent profile contract parity**
   - Config merge, default Codex, all five agent profiles, provider flags/doctor checks, adapter-swap tests.

6. **Run persistence + artifacts**
   - Full run record, transcript/diff paths, artifact glob config, Artifact/Edge/SearchDocument writes, session resume semantics.

7. **HTTP extension + observability**
   - `GET /`, `GET /api/v1/state`, `GET /api/v1/<issue>`, `POST /api/v1/refresh`, loopback default, CLI `--port` precedence.

8. **CLI/Web/TUI dispatch parity**
   - tRPC dispatch endpoint, CLI command, web action, TUI action, e2e/fake provider tests.

Planner may split further if file ownership gets too large.

## Validation Architecture

### Core Commands

- Focused conformance: `bun test src/orchestration/__tests__/symphony-conformance.test.ts`
- Focused app-server client: `bun test src/orchestration/symphony/app-server-client.test.ts`
- Focused Sandcastle: `bun test src/orchestration/sandbox-runner.test.ts src/orchestration/artifact-harvest-hook.test.ts src/orchestration/__tests__/session-resume.test.ts src/orchestration/__tests__/token-tracking.test.ts`
- Surface tests: run focused CLI/TUI/web orchestration test files, then `bun run ci`.
- Trace validation: `bun run scripts/gen-conformance-trace.ts --write` only when updating generated files, then `fulcrum symphony conformance` or equivalent test.

### Required Test Coverage

Each plan should add RED tests before implementation for its slice. Minimum coverage:

- Workflow path precedence, missing default file, invalid explicit file, invalid YAML, non-map front matter, `$VAR`, `~`, strict prompt, reload last-good.
- Full Issue model including all required fields, labels lowercase, full `blocked_by`, candidate sorting, blocker eligibility.
- Reconciliation Part B: terminal cleanup, non-active stop without cleanup, active update snapshot.
- Continuation retry after normal exit with 1000ms fixed delay.
- Failure retry with `min(10000 * 2^(attempt-1), max_retry_backoff_ms)`.
- Stall detection using `last_codex_timestamp` first, then `started_at`.
- App-server JSONL request/response/notification parsing, thread/turn extraction, timeout behavior, stderr separation.
- Token accounting cumulative by `thread_id` from `thread/tokenUsage/updated`.
- Provider config merge and adapter-swap tests for Claude/Codex/OpenCode/Gemini/Pi.
- Artifact harvest from configured glob and persistence of artifact edges/search docs.
- HTTP server endpoints and loopback/default port behavior.
- CLI/Web/TUI dispatch paths through tRPC with fake provider.

### Real Binary Smoke

Do not make real CLI binaries mandatory for default CI. Add opt-in smoke tests that skip loudly when binaries are absent:

- `codex app-server` smoke when `codex` is available and auth is configured.
- `claude`, `opencode`, `gemini`, `pi` smoke through adapter contract when binaries are available.

## Risks And Landmines

- **App-server API drift:** Use official docs and generated schemas when available. Avoid hard-coding assumptions not covered by fixtures.
- **State confusion:** Keep issue orchestration state separate from run-attempt lifecycle state; both may live on `AgentRun` but must be named distinctly.
- **Raw SQL regression:** Current web/product-kernel surfaces still use raw PGlite helpers. New Phase 3 dispatch must avoid deepening this path.
- **Token double-counting:** Cumulative update events must be keyed by `thread_id`; never sum cumulative totals blindly.
- **Provider overclaiming:** Modal/E2B are configured options but current Sandcastle version lacks actual drivers. Plan clear failure/doctor warnings unless dependency research proves driver availability.
- **HTTP extension scope:** Upstream says optional, but Phase 3 success criteria require it. Treat as required for Fulcrum Phase 3.
- **Generated trace:** Do not hand-edit `docs/symphony-conformance.md`; change generator/test metadata.
- **Branch policy:** Planning/execution stays on `dev/v1.0`; do not mutate `main`.

## Planner Checklist

- Every SYM-01..SYM-27 and SND-01..SND-06 ID appears in at least one plan frontmatter `requirements` field.
- Every D-01..D-22 from `03-CONTEXT.md` appears in at least one plan `must_haves` or objective.
- Plans use RED-first TDD tasks for each conformance slice.
- Plans include exact files to read/modify, not vague references.
- Plans avoid adding new docs except required planning/generated conformance/docs/sandbox posture artifacts.
- Plans include `bun run ci` as final verification after focused tests.

