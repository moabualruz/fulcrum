# Phase 4: Inference + Router/Skills - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase hardens Fulcrum's inference runtime and fully wires router + skills behavior across Web, CLI, and TUI. It covers INF-01 through INF-07 and RTR-01 through RTR-08: backend parity for embedded/Ollama/LM Studio/OpenAI-compatible inference, model-dimension-safe embedding storage, static binary proof, real model tests, routing rules and learned drafts, LLM fallback gating, MCP servers as virtual skills, skill sync/lock enforcement, and three-surface routing configuration UX.

This phase builds on Phase 3's agent dispatch/profile work and must not reopen Phase 1/2 architecture decisions: use tRPC/service/repository/MikroORM paths, feature flags for optional behavior, and local-first defaults with explicit cross-platform proof.

</domain>

<decisions>
## Implementation Decisions

### Inference Runtime Contract
- **D-01:** Treat embedded Rust, Ollama, LM Studio, and OpenAI-compatible backends as equal Phase 4 runtime targets. The implementation must prove backend parity rather than making embedded the only canonical backend.
- **D-02:** `fulcrum inference status` and doctor should report typed degraded states for configured unavailable backends, including reason. `start` starts the embedded sidecar only; external backends are probed, not launched.
- **D-03:** INF-02 requires a full cross-build gate: automated macOS and Linux static build proof must exist before Phase 4 closes.
- **D-04:** Embedded fastembed real calls are mandatory. Any backend configured/enabled for Phase 4 must pass real embed/generate calls before completion; unconfigured optional backends are not required.

### Embedding Schema + Model Dimensions
- **D-05:** Perform the embedding dimension migration globally in Phase 4. Update every `vector(1536)` schema/spec/code reference to the configured embedding dimension; default fastembed target is `vector(384)`.
- **D-06:** Vector storage dimension is derived from configured embedding model metadata, not from a hard-coded abstract constant. Default fastembed uses 384 dimensions. Non-384 models must fail configuration validation unless schema/storage explicitly supports that dimension.
- **D-07:** If embedding model dimension changes, fail closed until a migration/reindex plan exists. Do not allow silent mixed-dimension data.
- **D-08:** Acceptance proof must include schema + round-trip + search proof: migration/entity/spec agree, embed writes correct dimensions, and retrieval/search reads the same vector without coercion.

### Router Learning Behavior
- **D-09:** No-match learned routing rules are stored as disabled draft/review-needed rules first. They are not active until promoted.
- **D-10:** Learned draft rules must store full decision evidence: task facts, no-match reason, proposed conditions/actions, source, confidence, and model/backend when LLM is involved.
- **D-11:** Web, CLI, and TUI must all be able to approve, activate, and delete learned drafts in Phase 4.
- **D-12:** If a learned draft overlaps existing active rules, mark it with explicit `conflict` state, keep it disabled, show matching active rule IDs, and require edit/delete.

### LLM Routing Gate
- **D-13:** When `router-llm` is enabled, LLM fallback can recommend routes and create disabled draft rules with evidence. It must not directly activate rules.
- **D-14:** Low confidence must abstain and record evidence instead of forcing a route.
- **D-15:** LLM routing input scope is configurable. Default is full context bundle. Task-facts-only and task-plus-recent-routing-history modes are selectable and managed in interfaces.
- **D-16:** Privacy/security guardrails for full-context routing are configurable and manageable in all interfaces; default remains full context in all states. Preserve existing secret-handling guarantees from the context assembler; do not add a hard restriction unless configured.

### MCP as Virtual Skills
- **D-17:** MCP servers appear as first-class virtual skills in the same skill registry/search/surfaces, with source type `mcp` and capability metadata.
- **D-18:** Virtual MCP skills are discoverable descriptors only. They describe server/tools/capabilities; actual invocation remains through the agent/MCP runtime.
- **D-19:** MCP virtual skills are pinned by registry descriptor: server name, command/package/version/env hints, and tool manifest hash when available.
- **D-20:** MCP virtual skills are globally visible in skill surfaces without per-agent support details.

### Skill Sync + Lock Policy
- **D-21:** `skills.lock.json` SHA mismatch fails closed for that skill and surfaces exact expected/actual SHA.
- **D-22:** Upstream skill sync auto-merges safe diffs when the local file is unmodified. Local edits create conflicts requiring review.
- **D-23:** Conflicts produce structured three-way conflict artifacts with local/upstream/base hashes and suggested resolution. Do not write inline conflict markers into `SKILL.md`.
- **D-24:** Web, CLI, and TUI can override conflicts and lock mismatches, with audit record.

### Three-Surface Routing UX
- **D-25:** Routing config has full CRUD parity in Phase 4: Web, CLI, and TUI can list, test, create, update, and delete routing rules and learned drafts.
- **D-26:** Route tests return explainable results: matched rule/draft, facts used, confidence, backend if LLM, and why unmatched.
- **D-27:** Rule authoring uses structured builders in interfaces with a raw JSON escape hatch for advanced users.
- **D-28:** Rule saves require strict validation plus dry-run support. Invalid JSON/conditions are rejected; users can dry-run against sample tasks before save.

### the agent's Discretion
- Planner may choose exact service/repository boundaries, but must preserve Phase 1 architecture: surfaces call tRPC/shared services, services call MikroORM repositories, and no new raw SQL app paths.
- Planner may choose exact config names for routing input modes, confidence thresholds, backend health states, and lock override commands, provided all decisions above remain true.
- Planner may decide how to implement cross-platform static build proof locally versus CI scripts, provided macOS and Linux proof is automated and repeatable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` — Phase 4 goal, dependency on Phase 3, TDD expectation, and success criteria.
- `.planning/REQUIREMENTS.md` — INF-01 through INF-07 and RTR-01 through RTR-08 definitions.
- `.planning/PROJECT.md` — local-first product direction, stack, no-deferrals v1 posture, and inference/router/skills target features.
- `.planning/STATE.md` — branch policy and locked Phase 1/2/3 architecture and orchestration decisions.
- `.planning/phases/01-architecture-convergence-security/01-CONTEXT.md` — architecture decisions Phase 4 must not reopen.
- `.planning/phases/02-bug-fixes-foundation/02-CONTEXT.md` — CI, feature flag, worker, DB, and foundation decisions.
- `.planning/phases/03-symphony-sandcastle/03-CONTEXT.md` — dispatch/profile/Sandcastle decisions Phase 4 builds on.

### Codebase Maps
- `.planning/codebase/STACK.md` — Bun, Rust inference workspace, tRPC, Hono, PGlite/PostgreSQL, and test stack.
- `.planning/codebase/INTEGRATIONS.md` — inference backends, MCP server management, connector framework, feature flags, and skill/MCP integration surfaces.
- `.planning/codebase/ARCHITECTURE.md` — Web/CLI/TUI to tRPC path, data layer, service/repository constraints, EventBus, and existing inference/orchestration boundaries.

### Implementation Starting Points
- `inference/` — Rust inference workspace, embedded server, fastembed implementation, cache, and smoke script.
- `src/inference/` — TypeScript inference protocol, client, lifecycle, routing config, and backend adapters.
- `src/server/trpc/routers/inference.ts` — tRPC inference surface.
- `src/cli/inference.ts` and `src/cli/inference.test.ts` — CLI inference command behavior and tests.
- `src/router/` — rules engine, no-match learning, LLM fallback, routing telemetry, and tests.
- `src/server/trpc/routers/routing.ts` — tRPC routing config surface.
- `src/skills/loader.ts`, `src/skills/upstream-sync.ts`, and `src/skills/lock.ts` — skill load/sync/lock implementation.
- `src/server/trpc/routers/skills.ts` — skill registry tRPC surface.
- `src/cli/mcp-cmd.ts`, `src/cli/mcp-builtins.ts`, and `src/components/catalog.ts` — MCP management and built-in server catalog.
- `src/db/entities/router/RoutingRule.ts`, `src/db/entities/skills/`, and `src/db/entities/inference/` — persistence starting points.
- `src/db/migrations/` — schema updates for embedding dimensions, routing drafts/evidence/conflicts, and virtual skill metadata.
- `src/tui/index.ts` and TUI screen registry — existing TUI inference/routing/status surfaces.
- `src/web/` routes/components for settings/routing/skills/inference — Web UI integration points.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/inference/lifecycle.ts`, `src/inference/client.ts`, `src/inference/routing-config.ts`, and `src/inference/backends/` already provide lifecycle, protocol, backend routing, and backend adapter seams.
- `inference/inference-embed/src/lib.rs` uses fastembed and includes deterministic 384-dim tests; this is the default model proof anchor.
- `src/router/rules-engine.ts`, `src/router/no-match-prompt.ts`, and `src/router/llm-fallback.ts` already implement core routing, learned rules, and LLM fallback concepts.
- `src/skills/lock.ts` and `src/skills/upstream-sync.ts` are the natural places for lock validation, safe auto-merge, conflict artifacts, and overrides.
- `src/cli/mcp-builtins.ts` and MCP component/catalog code provide existing MCP descriptors that can become virtual skill descriptors.

### Established Patterns
- Root gate is `bun run ci`; use focused `bun test` suites while iterating, then run the project gate before completion.
- Optional capabilities use feature flags through `FULCRUM_FEATURES` and the flag registry.
- Three-surface parity should route through shared tRPC/service behavior instead of duplicating business logic in Web/CLI/TUI.
- Phase 3 established profile/dispatch/sandbox config patterns; Phase 4 should reuse those for inference/routing/skills configurability.

### Integration Points
- Inference CLI, tRPC router, doctor checks, and TUI status must agree on backend health/degraded-state shape.
- Embedding dimension work touches migrations/entities, inference model metadata, doc/search/memory embedding callers, and acceptance tests.
- Router learning connects rules engine/no-match/LLM fallback to routing rules persistence, events/audit, and three-surface rule management.
- Virtual MCP skills connect MCP registry/catalog descriptors with the skills registry/search/UI surfaces while invocation remains in agent/MCP runtimes.
- Skill sync/lock policy connects upstream sync, lock validation, conflict artifacts, audit logs, and override flows in all interfaces.

</code_context>

<specifics>
## Specific Ideas

- Backend parity is required, but configured/enabled backends are the real-call gate. Unconfigured optional backends do not block completion.
- Full context is the default LLM routing input mode, even though narrower modes must be configurable.
- MCP virtual skills are globally visible without per-agent support details, despite runtime support possibly differing by agent.
- Routing authoring should be usable through guided fields but retain raw JSON control for advanced rules-engine use.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 4 scope.

</deferred>

---

*Phase: 4-Inference + Router/Skills*
*Context gathered: 2026-05-05*
