---
date: 2026-04-24
topic: agent-os-system-design
focus: docs/research/2026-04-24-local-first-agent-os-product-stack.md
---

# Ideation: Local-First CLI Agent OS System Design

## Codebase Context

This branch is intentionally code-light after purging implementation code. Current durable inputs are docs:

- `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`
- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- prior docs under `docs/ideation/`, `docs/brainstorms/`, and `docs/plans/`

The recovered scope doc reframes Fulcrum as a local-first CLI agent operating system, not a RAG app or SaaS PM sync client. Core modules: memory, code intelligence, memory-code graph, owned PM cockpit, agent orchestration, worktree delivery, policy, monitoring, action interface, optional sync, and telemetry.

External research checked current primary sources:

- Plane developer docs: self-hosting, REST API, webhooks, MCP server.
- Windmill docs/GitHub: self-host model, scripts/workflows/UIs, Postgres-backed workers, sandboxing, TypeScript/Python/Go/Bash runtimes.
- LightRAG paper: graph-structured RAG, dual-level retrieval, incremental update algorithm.
- Zoekt GitHub: local indexing/search CLI, web UI/API, JSON/gRPC API, code-oriented ranking.
- Tree-sitter GitHub: incremental parser, concrete syntax trees, robust parsing, embeddable C runtime.
- LanceDB docs: embedded OSS local path like SQLite, vector/full-text/hybrid search.
- OpenTelemetry docs: semantic conventions for traces, metrics, logs, resources.
- Tauri docs: JavaScript frontend, Rust application logic, cross-platform desktop/mobile, native web renderer.

## Ranked Ideas

### 1. Product Kernel With Owned Domain Model

**Description:** Build a small Fulcrum-owned kernel around workspaces, projects, tasks, runs, events, artifacts, context refs, graph refs, and policy decisions. Plane/Windmill/LightRAG/Zoekt/LanceDB are managed products behind adapters, not the source of truth for OS identity.

**Rationale:** Prevents external products from defining the product. Keeps local-first state recoverable and lets tools be replaced.

**Downsides:** Requires discipline; easy to let Plane or Windmill become the real model.

**Confidence:** 95%

**Complexity:** Medium

**Status:** Explored

### 2. Rust Core, TypeScript UI, Python RAG Sidecar

**Description:** Use Rust as the primary language for the local daemon, CLI, indexing orchestration, file watching, SQLite/event store, Tauri shell, and adapter supervisor. Use TypeScript for web/Tauri UI and extension-facing code. Keep Python isolated behind a LightRAG sidecar boundary.

**Rationale:** Rust fits always-on local system software, Tauri, file/index workloads, and single-binary distribution. TypeScript gives UI velocity. Python is accepted only where the chosen RAG product requires it.

**Downsides:** Mixed-language stack. Rust raises implementation bar. Python sidecar adds packaging risk.

**Confidence:** 90%

**Complexity:** High

**Status:** Explored

### 3. Plane As Optional PM Product, Not Mandatory Core

**Description:** Validate Plane as the PM cockpit candidate through adapter and optional sidecar UI, but keep Fulcrum's task/run/agent model owned locally. Plane can provide project/work item/pages/views surface if it passes local-machine and customization gates.

**Rationale:** Plane has API/webhooks/MCP/self-host support, but it may be too heavy or misaligned for a personal local agent OS.

**Downsides:** If Plane fails, a custom cockpit must be built. If Plane succeeds, UI customization still may require fork/sidecar.

**Confidence:** 80%

**Complexity:** High

**Status:** Explored

### 4. Windmill For Human-Triggered Actions, Owned Scheduler For Agent Runs

**Description:** Use Windmill for operator-triggered workflows, scripts, forms, webhooks, and action logs. Keep low-latency agent run lifecycle, task claiming, heartbeats, and live event stream in Fulcrum.

**Rationale:** Windmill dominates Temporal for product surface, but a CLI agent OS needs tight local run control that should not round-trip through a workflow product for every heartbeat/action.

**Downsides:** Two orchestration layers must be clearly separated.

**Confidence:** 86%

**Complexity:** Medium

**Status:** Explored

### 5. Dual Code Intelligence: Zoekt + Tree-sitter + LanceDB

**Description:** Treat code search as a separate system from memory RAG. Zoekt handles lexical/regex/path search. Tree-sitter owns structure, symbols, imports, and syntax chunks. LanceDB stores semantic/hybrid chunk retrieval. Fulcrum fuses results.

**Rationale:** Exact code facts and semantic retrieval have different failure modes. One RAG tool should not own code search.

**Downsides:** Three indexes plus fusion. Requires incremental invalidation discipline.

**Confidence:** 92%

**Complexity:** High

**Status:** Explored

### 6. LightRAG For Memory Graph RAG, Not Unified System Graph

**Description:** Use LightRAG to power memory/doc graph RAG, while Fulcrum maintains a separate canonical OS graph of tasks, runs, code refs, artifacts, policies, and memory refs.

**Rationale:** LightRAG is strong for graph-enhanced text retrieval and incremental RAG, but the product graph must link PM, actions, files, and code symbols.

**Downsides:** Two graph concepts exist. Needs clear naming: retrieval graph vs OS graph.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Explored

### 7. OpenTelemetry Semantics, Local Event Store First

**Description:** Model actions/runs/indexing/retrieval/policy events with OpenTelemetry-inspired semantic attributes, but store locally first in Fulcrum. Export to OTel collector only as optional integration.

**Rationale:** OTel gives a vocabulary without forcing Grafana/SigNoz/collector complexity into the default dev-machine profile.

**Downsides:** Need avoid inventing incompatible custom telemetry names.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Explored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Dify as core RAG product | Too heavy and too team/server-oriented for local dev-machine target. |
| 2 | Qdrant as default vector store | Strong product, but duplicates LanceDB/LightRAG and adds a service. |
| 3 | Temporal as default orchestrator | Durable execution is excellent, but weak operator UI/product surface versus Windmill. |
| 4 | Huly as PM cockpit | Too broad outside target; collaboration/business apps are not core. |
| 5 | Vikunja as first PM cockpit | Lightweight but narrower than Plane; keep as fallback if Plane is too heavy. |
| 6 | sqlite-vec as default retrieval store | Excellent fallback, but LanceDB covers vector + FTS + hybrid in one product. |
| 7 | Neo4j/Memgraph as graph default | Graph databases are not memory graph RAG products by themselves and add service weight. |
| 8 | Grafana/SigNoz as default dashboard | Generic observability cannot own agent PM operations. |
| 9 | Python as primary app language | Useful for RAG sidecars, poor fit for single-binary local OS and desktop shell. |
| 10 | TypeScript-only backend | Fastest for UI and adapters, weaker for native daemon/indexing/distribution than Rust. |
| 11 | Go as primary language | Pragmatic CLI/service option, but weaker Tauri/local desktop story and less direct tie to chosen UI shell. |

## Session Log

- 2026-04-24: Initial CE ideation from recovered research and scope docs. 18 candidates considered, 7 survived. Routed to `ce:brainstorm` and `ce:plan` artifacts for requirements and system design.
