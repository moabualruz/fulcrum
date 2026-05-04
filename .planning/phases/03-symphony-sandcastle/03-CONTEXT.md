# Phase 3: Symphony + Sandcastle - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers full OpenAI Symphony SPEC.md conformance using Fulcrum's native tracker as the primary orchestration backend, with Sandcastle-based agent dispatch functional across Fulcrum's CLI-agent profile system. Phase 3 covers SYM-01 through SYM-27 and SND-01 through SND-06: `WORKFLOW.md` loading/reload, strict prompt/config behavior, native tracker adapter, poll/retry/stall/reconciliation lifecycle, app-server dispatch, structured logs, token accounting, HTTP extension, approval/sandbox posture documentation, Sandcastle run persistence, artifact harvest, session resume, provider configurability, and dispatch surfaces. It does not reopen Phase 1/2 architecture decisions or branch policy.

</domain>

<decisions>
## Implementation Decisions

### Tracker Authority + Issue Model
- **D-01:** Fulcrum native tracker adapter must be strict about the Symphony 12-field Issue model. It always returns every required field; missing local data may become explicit `null` or defaults only where the spec allows.
- **D-02:** `blocked_by` must return full blocker refs as `{id, identifier, state}` objects. Unresolved blockers should fail conformance/tests instead of silently degrading.
- **D-03:** `agent_runs.orchestration_state` is the single mutable orchestration authority. Tasks remain domain work items and eligibility inputs, not the primary run-state source.
- **D-04:** External trackers such as Linear and GitHub Issues are ingest-only in Phase 3. They may create/update Fulcrum tasks, but Symphony dispatch uses the native Fulcrum tracker.
- **D-05:** Future versions should add dispatch-capable adapter parity for external trackers; document this as deferred, not Phase 3 scope.

### WORKFLOW.md Runtime Behavior
- **D-06:** Phase 3 should implement spec-complete repo-owned `WORKFLOW.md` control: prompt body, typed config, `$VAR` env resolution, `~` path expansion, hooks, Codex command/policy fields, server config, and dynamic reload.
- **D-07:** Invalid reload keeps the last good config active, rejects the new invalid config, and emits a visible error.
- **D-08:** Unknown prompt variables or filters fail closed with a typed render error. Runs must not dispatch with corrupted prompts.
- **D-09:** Approval/sandbox posture must be explicitly documented: default command, approval policy, thread sandbox, turn sandbox, and `noSandbox` host trust boundary.

### Dispatch + Sandbox Posture
- **D-10:** All five CLI agents can be dispatch-capable primaries: Claude Code, Codex, OpenCode, Gemini, and Pi. Codex is the default primary because Symphony's app-server path is Codex-centered.
- **D-11:** Agent-specific configuration must be dynamically allowed in full. `WORKFLOW.md` can override per-agent command/model/policy/sandbox fields; persisted `AgentProfile` supplies defaults.
- **D-12:** Default sandbox mode is `noSandbox` host mode, with explicit trust-boundary warnings.
- **D-13:** Docker, Podman, Vercel, Daytona, Modal, and E2B should be supported through configuration/feature flags and doctor checks when configured. They do not replace `noSandbox` as the default.
- **D-14:** Non-default agents must prove contract parity against the same `AgentRun` request/result contract. Adapter-swap tests are required for Claude/Codex/OpenCode/Gemini/Pi; real full e2e for every installed binary is not required as the primary gate.

### Conformance Proof Shape
- **D-15:** Phase 3 closes only when both spec conformance gates and surface dispatch proof pass: generated trace plus focused §17.1-17.7 tests are hard gates, and Web/CLI/TUI dispatch flows must have e2e coverage for the user-facing dispatch path.
- **D-16:** Tests must be RED-first slices per requirement/slice, preserving TDD evidence before implementation.
- **D-17:** `docs/symphony-conformance.md` is generated source of truth. Update `scripts/gen-conformance-trace.ts`, tests, or source metadata; do not hand-edit the trace to make claims true.
- **D-18:** CI should use protocol/provider fakes for deterministic conformance. Real CLI binary smoke tests should run when binaries are available, and absence of optional binaries should not make core CI flaky.

### Artifact + Session Lifecycle
- **D-19:** Phase 3 must persist full run records: transcript JSONL, workspace diff, harvested artifacts, token usage, sandbox mode, iteration count, and exit reason.
- **D-20:** Artifact harvest uses a configured glob from `WORKFLOW.md` or profile config, with a default that catches common outputs. Harvested files become Artifact entities linked to the run.
- **D-21:** Retry/continuation must pass prior transcript/session information when the agent supports session resume. Unsupported agents must fail clearly or no-op by declared capability, not silently lose resume behavior.
- **D-22:** Token accounting must consume `thread/tokenUsage/updated`, key cumulative totals by `thread_id`, avoid double-counting, and persist totals on the run.

### the agent's Discretion
- Planner may choose exact internal service/repository boundaries as long as Phase 1 architecture remains intact: tRPC/surfaces call services, services call MikroORM repositories, no new raw SQL app paths.
- Planner may decide which real-binary smoke tests are opt-in versus default based on reliable local availability, but protocol/provider fake conformance remains mandatory.
- Planner may choose exact provider flag names and merge precedence details, provided `WORKFLOW.md` overrides profile defaults and profile defaults remain persisted.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` — Phase 3 goal, dependencies, SYM/SND requirement range, TDD expectation, and success criteria.
- `.planning/REQUIREMENTS.md` — SYM-01 through SYM-27 and SND-01 through SND-06 definitions.
- `.planning/PROJECT.md` — product direction, local-first constraints, stack, and full Symphony conformance requirement.
- `.planning/STATE.md` — current branch policy and locked Phase 1/2 architecture/foundation decisions.
- `.planning/phases/01-architecture-convergence-security/01-CONTEXT.md` — architecture decisions Phase 3 must not reopen.
- `.planning/phases/02-bug-fixes-foundation/02-CONTEXT.md` — CI, branch policy, feature flags, worker registry, and foundation decisions Phase 3 builds on.

### Symphony + Sandcastle Specs
- `vendor/openai-symphony/SPEC.md` — canonical OpenAI Symphony spec; full conformance required.
- `docs/symphony-conformance.md` — generated conformance trace and required test IDs; generated, not hand-authored.
- `.symphony-spec.lock` — pinned Symphony submodule/spec checksum.
- `justfile` — `sync-symphony` recipe for spec sync and conformance trace generation.
- `scripts/gen-conformance-trace.ts` — generator for the conformance trace.

### Codebase Maps
- `.planning/codebase/STACK.md` — Bun, MikroORM, PGlite/PostgreSQL, Hono, tRPC, Effect, Sandcastle dependency, and test stack.
- `.planning/codebase/INTEGRATIONS.md` — connector posture, OpenAI Symphony submodule, Sandcastle/provider integrations, feature flags, and doctor checks.
- `.planning/codebase/ARCHITECTURE.md` — orchestration flow, tRPC/core layering, EventBus, DB, and presentation-surface boundaries.

### Implementation Starting Points
- `src/orchestration/symphony/` — existing Symphony orchestration modules: tracker, orchestrator, prompt, workspace, hooks, retry, stall, dispatch.
- `src/orchestration/sandbox-runner.ts` — Sandcastle provider resolution, host trust-boundary warning, run execution, artifact/diff/transcript/token handling.
- `src/orchestration/__tests__/symphony-conformance.test.ts` — current conformance test suite starting point.
- `src/db/entities/orchestration/AgentRun.ts` — canonical run entity and orchestration state fields.
- `src/db/entities/sandbox/` — Sandcastle artifact/profile/edge entities.
- `src/agents/profiles/` and `src/agents/registry.ts` — CLI agent profile defaults for Claude Code, Codex, Gemini, OpenCode, Pi, and Copilot.
- `src/trpc/routers/orchestration.ts`, `src/cli/commands/symphony.ts`, and `src/tui/screens/orchestration.ts` — dispatch/status surface integration points.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/orchestration/symphony/prompt.ts` already owns `WORKFLOW.md` loading, config parsing, and strict prompt rendering concepts.
- `src/orchestration/symphony/orchestrator.ts`, `tracker.ts`, `retry.ts`, `stall.ts`, `workspace.ts`, and `hooks.ts` already split orchestration concerns into testable modules.
- `src/orchestration/sandbox-runner.ts` already resolves `noSandbox`, Docker, Podman, and optional cloud-provider flags; it also emits the host trust-boundary warning.
- `src/orchestration/artifact-harvest-hook.ts`, `src/artifacts/harvest.ts`, `src/orchestration/transcript-diff.ts`, `src/orchestration/session-resume.ts`, and `src/orchestration/token-tracking.ts` are the existing lifecycle persistence utilities.
- `src/db/entities/orchestration/AgentRun.ts` already stores orchestration state, sandbox mode, iteration count, token count, transcript path, workspace diff path, agent identity, claim owner, and search doc link.
- `src/db/entities/sandbox/Artifact.ts`, `Edge.ts`, and `AgentProfile.ts` provide Sandcastle persistence surfaces.

### Established Patterns
- Root gate is `bun run ci`; use focused `bun test` suites while iterating, then run the project gate before completion.
- Phase 2 moved foundation toward explicit feature flags, worker registry, permission gates, and stable web/CI gates. Phase 3 should use those instead of creating parallel config paths.
- Architecture decisions require tRPC/services/repositories/MikroORM as the business path. Avoid reintroducing product-kernel raw SQL paths for new orchestration work.
- `docs/symphony-conformance.md` is generated from source/spec metadata. Treat generator output as evidence, not hand-edited documentation.

### Integration Points
- Native tracker maps Fulcrum task/run state into Symphony issue candidates and run lifecycle.
- `WORKFLOW.md` loader connects repository-local runtime policy to prompt rendering, hooks, agent config, server config, retry/stall policy, and reload.
- Sandcastle runner connects agent profile, sandbox provider, worktree, transcript/diff/artifact/token persistence, and run repository updates.
- CLI/Web/TUI dispatch surfaces connect through tRPC orchestration procedures and shared run entities.
- Doctor surfaces should report configured sandbox provider availability and warn when Docker/Podman/cloud provider flags are enabled but prerequisites are absent.

</code_context>

<specifics>
## Specific Ideas

- Default primary agent is Codex, but downstream planning must not hard-code a Codex-only architecture. Claude Code, OpenCode, Gemini, and Pi should be dynamically configurable as dispatch-capable primaries through agent profiles and `WORKFLOW.md`.
- `noSandbox` remains default even though all configured sandbox providers should be supported when requested.
- External tracker dispatch parity is future work; Phase 3 should document it without expanding current scope beyond native Fulcrum tracker dispatch.
- Real CLI binaries should be used for smoke coverage when available, while deterministic fake/provider tests keep CI stable.

</specifics>

<deferred>
## Deferred Ideas

- Dispatch-capable Symphony tracker adapter parity for external trackers such as Linear and GitHub Issues belongs in a future version. Phase 3 keeps them ingest-only.

</deferred>

---

*Phase: 3-Symphony + Sandcastle*
*Context gathered: 2026-05-04*
