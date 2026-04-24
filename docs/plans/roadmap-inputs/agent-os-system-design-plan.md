# Agent OS System Design Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-agent-os-system-design-plan.md

## Must Carry Into Roadmap
- Build local-first Fulcrum CLI Agent OS from docs/fresh codebase, not deleted implementation.
- Runtime ownership: Rust owns kernel/daemon/CLI/Tauri backend/file watching/supervision/event store/indexing; TypeScript owns cockpit UI, adapter UI, product API glue; Python limited to supervised LightRAG sidecar.
- Canonical state stays in Fulcrum: workspace, project, task, run, artifact, event, policy decision, adapter ref, graph ref. External products/adapters never mutate canonical state directly.
- Product stack to validate: Plane PM cockpit adapter, Windmill action workflow runner, LightRAG memory graph RAG, Zoekt lexical code search, Tree-sitter AST/symbol/chunk extraction, LanceDB semantic/hybrid retrieval, OpenTelemetry vocabulary, Tauri desktop shell.
- Component boundaries:
  - Kernel: registry, tasks/runs/artifacts/events, migrations, policy gates, adapter contracts, health checks, context builder.
  - Cockpit: global/per-project boards, live agents/actions, run details, memory/code graph viewer, review/merge queues, health/reporting, action launcher.
  - Windmill: scripts/workflows/forms/webhooks/schedules/operator run logs only; Fulcrum owns live agent lifecycle, heartbeats, task claiming, policy, event/task/run ID mapping.
  - LightRAG: retrieval graph only; Fulcrum owns provenance and OS graph refs.
  - Code intelligence: watcher -> classifier -> Tree-sitter -> symbols/imports/chunks -> Zoekt -> LanceDB -> OS graph refs -> context builder.
- Memory-code-PM graph links must include task/run/action/event/artifact, task/plan to file/symbol/chunk, memory to L0/entity/task/plan/file/symbol, file to symbol/import/chunk, artifact to file, policy decision to action/run.
- Default local use must work without external telemetry backend; OTel export optional.

## Milestone Impacts
- M1 architecture spike: create disposable validation workspace; prove local workspace/project/task/run creation, event emit/replay, missing adapter health.
- M2 adapter contracts: define health, external ID mapping, and canonical-state protection before product integration.
- M3 code intelligence spike: validate Tree-sitter + Zoekt + LanceDB on real repo; incremental create/update/delete/rename behavior and explainable context ranking are roadmap gates.
- M4 memory RAG spike: validate markdown and L0 import into LightRAG with source IDs, incremental update/delete, provenance traces, and local CPU/model path.
- M5 cockpit/live stream: build owned event-driven cockpit before committing to Plane UI/fork; validate boards, active run stream, policy/result status, sidecar health.
- Product sequencing: freeze stack/boundaries, validate Rust daemon + TS Tauri skeleton, validate code and memory independently, validate Plane/Windmill footprint, then connect OS graph refs.
- Plane remains optional/sync surface unless it passes footprint/customization gates; owned cockpit remains fallback/primary path.

## Acceptance Criteria
- Product winners, fallbacks, language decision, OS graph vs retrieval graph boundary, validation gates, future paths, and test scenarios are documented before implementation.
- Kernel state tests cover workspace/project/task/run creation and event replay.
- Adapter contract tests prove health reporting, external ID mapping, and no direct canonical mutation.
- Code index tests prove exact identifier ranking, changed-file AST/semantic update, deleted-file cleanup, graph ref invalidation, and explainable ranked hits.
- LightRAG tests prove source ID preservation, update/delete without full rebuild, query provenance trace, and graph entity/relationship exposure sufficient for Fulcrum graph refs.
- Cockpit/SSE tests prove global/per-project boards, live run updates, action policy/result events, and visible sidecar health.
- Planning phase requires no code implementation.

## Risks / Open Questions
- Plane may be too heavy or hard to customize; keep owned cockpit and optional Plane import/export/sync.
- Windmill may duplicate run lifecycle; enforce hard boundary: Windmill actions, Fulcrum agent runs.
- LightRAG delete/provenance may be weak; fallback Kuzu/LanceDB custom memory pipeline.
- LanceDB TypeScript/Rust maturity may block adapter quality; fallback sqlite-vec + FTS5.
- Rust may slow early product iteration; keep UI/adapters in TypeScript and constrain Rust to durable kernel behavior.
- Too many sidecars may hurt local adoption; default should boot kernel/cockpit only, with sidecars opt-in until validated.
- Open question: exact storage engine for Fulcrum local event store/DB not chosen in this doc.
- Open question: stable ID scheme for files, symbols, graph refs, and external adapter refs needs later spec.
- Open question: CPU/local model performance threshold for LightRAG acceptance needs numeric target.

## Links To Preserve
- Origin requirements: `/home/mkh/workspace/pi-stack-plan/docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md`
- Product stack research: `/home/mkh/workspace/pi-stack-plan/docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- Fulcrum scope: `/home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`
- Full product delivery plan: `/home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md`
- Plane docs: https://developers.plane.so/
- Windmill self-host docs: https://www.windmill.dev/docs/advanced/self_host
- Windmill GitHub: https://github.com/windmill-labs/windmill
- LightRAG paper: https://arxiv.org/abs/2410.05779
- Zoekt: https://github.com/sourcegraph/zoekt
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- LanceDB docs: https://docs.lancedb.com/quickstart and https://docs.lancedb.com/search
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/concepts/semantic-conventions/
- Tauri: https://tauri.app/
