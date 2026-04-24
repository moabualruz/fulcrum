# Agent OS Validation Spike

Date: 2026-04-24
Status: implementation spike

Source plan:

- `docs/plans/2026-04-24-agent-os-system-design-plan.md`

## Unit Coverage

| Plan Unit | Implemented Spike Surface | Validation |
|---|---|---|
| Unit 1: Architecture Spike Harness | `crates/fulcrum-kernel`, `crates/fulcrum-events`, `crates/fulcrum-graph`, `crates/fulcrum-daemon` | create workspace/project/task/run, emit/replay events, report adapter health |
| Unit 2: Product Adapter Contracts | `crates/fulcrum-kernel/src/adapters.rs`, `adapters/*/README.md` | default adapters cover Plane, Windmill, LightRAG, Zoekt, LanceDB; external IDs map to Fulcrum refs through kernel-owned registry |
| Unit 3: Code Intelligence Spike | `crates/fulcrum-code-index` | contract-level Tree-sitter/Zoekt/LanceDB backend surfaces, update/delete files, extract symbols/chunks/imports, lexical-first search, graph refs |
| Unit 4: Memory RAG Spike | `crates/fulcrum-memory`, `adapters/lightrag/README.md` | markdown/L0 import with caller-provided source IDs, update/delete without rebuild, provenance in hits |
| Unit 5: Cockpit And Live Stream | `crates/fulcrum-desktop`, `crates/fulcrum-daemon`, `apps/cockpit` | passive live snapshot shows tasks, active runs, adapter health details, events; daemon exposes cursor-based SSE encoding contract |

## Boundary Decisions

- Fulcrum owns canonical state and local event stream.
- Product adapters are explicit boundaries.
- Current code validates contracts and incremental behavior only; external product binaries are not installed or exercised yet.
- Windmill action requests do not mutate agent run lifecycle.
- LightRAG retrieval graph remains separate from Fulcrum OS graph.
- Code intelligence is not generic RAG over source files; it has separate lexical, structure, semantic, and graph surfaces.

## Requirement Trace

| Requirement | Implementation Path | Test Path | Status |
|---|---|---|---|
| R5 PM cockpit | `apps/cockpit/src/routes/dashboard.ts` and snapshot DTO | `apps/cockpit/tests/live_stream.spec.ts` | spike board shell only; queues/review/merge later |
| R8 action boundary | `crates/fulcrum-actions` and Windmill adapter README | `crates/fulcrum-actions/tests/windmill_boundary.rs` | covered at contract level |
| R16 live actions/events | `crates/fulcrum-daemon/src/lib.rs` SSE encoding and `crates/fulcrum-desktop` snapshot | `crates/fulcrum-daemon/tests/sse_stream.rs`, `crates/fulcrum-desktop/tests/live_stream.rs` | cursor stream contract covered; HTTP server later |
| R18 health reporting | `Kernel::health_report`, `OperatorSnapshot.health` | `crates/fulcrum-desktop/tests/live_stream.rs` | adapter names/status/messages visible |

## Manual Smoke

Run:

```bash
cargo test
cargo run -p fulcrum-daemon
```

Expected daemon output includes:

```text
fulcrum-daemon ready tasks_running=1 active_runs=1 health_items=5
```
