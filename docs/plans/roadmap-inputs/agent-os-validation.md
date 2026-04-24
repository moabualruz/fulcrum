# Agent OS Validation Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/spikes/agent-os-validation.md

## Must Carry Into Roadmap
- Fulcrum owns canonical state and local event stream; external products integrate through explicit adapter boundaries.
- Kernel-owned registry maps external product IDs to Fulcrum refs; roadmap should preserve this as contract surface, not product-specific coupling.
- Spike validated contracts and incremental behavior only; Plane, Windmill, LightRAG, Zoekt, LanceDB binaries were not installed or exercised end to end.
- Code intelligence must remain distinct from generic source-file RAG, with lexical, structure, semantic, and graph surfaces.
- LightRAG retrieval graph remains separate from Fulcrum OS graph; preserve provenance in memory hits.
- Windmill action requests must not mutate agent run lifecycle.
- Daemon/cockpit path has cursor-based SSE encoding contract and passive live snapshot, but no full HTTP/server production surface yet.

## Milestone Impacts
- Architecture harness milestone should include create workspace/project/task/run, local event emit/replay, and adapter health reporting.
- Product adapter milestone should harden Plane, Windmill, LightRAG, Zoekt, and LanceDB contracts, then add real binary/integration validation.
- Code intelligence milestone should cover Tree-sitter/Zoekt/LanceDB backend contracts, file update/delete, symbol/chunk/import extraction, lexical-first search, and graph refs.
- Memory milestone should include markdown/L0 import using caller-provided source IDs, update/delete without rebuild, and provenance-preserving retrieval.
- Cockpit milestone should start from passive dashboard/snapshot and add queues, review, merge, and production live stream transport.
- Actions milestone should keep Windmill as execution boundary with contract-level tests before lifecycle orchestration is introduced.

## Acceptance Criteria
- `cargo test` passes across spike workspace surfaces.
- `cargo run -p fulcrum-daemon` prints readiness with running task/run counts and five health items.
- Health report exposes adapter names, statuses, and messages in operator snapshot.
- SSE stream supports cursor-based event encoding and is covered by daemon tests.
- Cockpit live stream spec shows tasks, active runs, adapter health details, and events.
- Action boundary tests prove Windmill requests do not directly mutate agent run lifecycle.
- Code index tests cover incremental file update/delete plus lexical, structure, semantic, and graph-facing outputs.
- Memory tests cover import/update/delete flows without rebuild and preserve source provenance in hits.

## Risks / Open Questions
- Real product integration risk remains high until Plane, Windmill, LightRAG, Zoekt, and LanceDB are installed and exercised.
- HTTP server behavior, auth, backpressure, reconnect semantics, and deployment shape for daemon SSE remain open.
- Cockpit currently validates board shell/passive snapshot only; review queues, merge flow, and operator actions need roadmap scope.
- Boundary between Fulcrum OS graph and LightRAG retrieval graph needs clear sync/provenance rules.
- External ID registry needs persistence, conflict handling, and migration strategy.
- Open question: which adapter failures should block runs versus only degrade health reports?
- Open question: what is minimum production acceptance for code intelligence quality across lexical, structural, semantic, and graph search?

## Links To Preserve
- Source plan: /home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-agent-os-system-design-plan.md
- Spike source: /home/mkh/workspace/pi-stack-plan/docs/spikes/agent-os-validation.md
- Kernel/events/graph/daemon: `crates/fulcrum-kernel`, `crates/fulcrum-events`, `crates/fulcrum-graph`, `crates/fulcrum-daemon`
- Adapter contracts: `crates/fulcrum-kernel/src/adapters.rs`, `adapters/*/README.md`
- Code intelligence: `crates/fulcrum-code-index`
- Memory RAG: `crates/fulcrum-memory`, `adapters/lightrag/README.md`
- Cockpit/live stream: `crates/fulcrum-desktop`, `apps/cockpit`, `crates/fulcrum-daemon/src/lib.rs`
- Key tests: `apps/cockpit/tests/live_stream.spec.ts`, `crates/fulcrum-actions/tests/windmill_boundary.rs`, `crates/fulcrum-daemon/tests/sse_stream.rs`, `crates/fulcrum-desktop/tests/live_stream.rs`
