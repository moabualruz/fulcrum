# System Design Requirements Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md

## Must Carry Into Roadmap
- Fulcrum must become a local-first CLI agent OS for individual developers/operators, not a cloud/team-server product.
- Fulcrum owns canonical local identity and state for workspaces, projects, tasks, agent runs, artifacts, events, policies, context refs, and graph refs.
- External products integrate through adapters only; Plane, Windmill, LightRAG, Zoekt, Tree-sitter, LanceDB, and OTel must not become Fulcrum's source of truth.
- Default install must run on a normal workstation with local files/databases; no Kubernetes, remote DB, or cloud service requirement.
- PM cockpit must cover global/per-project tasks, queues, run state, blockers, dependencies, reviews, merges, handoffs, and artifacts.
- Jira/Linear/GitHub/Plane sync stays optional import/export, not core workflow.
- Windmill can own user-triggered actions/workflows/scripts/forms/webhooks/logs, but Fulcrum owns agent lifecycle, heartbeats, task claiming, and live event stream.
- Memory must support markdown, L0 docs, provenance, incremental ingest/update/delete, graph-enhanced retrieval, and linkability.
- Code intelligence must be separate from memory RAG and combine lexical/path search, AST/symbols, semantic/hybrid retrieval, and result fusion.
- Fulcrum OS graph must link memory refs, code files/symbols/chunks, plans, tasks, runs, artifacts, and policy/action events; updates must happen on change.
- Live operator feedback is required through visible agent actions, system events, local event store, health reports, and OTel-aligned naming.
- Rust is primary for daemon, CLI, Tauri shell, file watching, indexing orchestration, adapter supervision, and persistence; TypeScript owns UI/extension-facing code; Python is sidecar-only where products require it.
- Each selected product needs a validation gate before becoming default; roadmap should name one preferred winner per capability plus fallbacks.

## Milestone Impacts
- Foundation milestone: define Fulcrum kernel schema, local persistence, event store, policy/context/graph refs, and adapter boundary contracts before product adapters become central.
- PM/orchestration milestone: deliver owned task/run lifecycle and cockpit model first; validate Plane only as replaceable PM surface.
- Actions milestone: validate Windmill local deployment and adapter fit while keeping heartbeats, task claiming, and run lifecycle inside Fulcrum.
- Memory milestone: validate LightRAG for local/offline use, provenance, update/delete/rename behavior, and links into Fulcrum graph before defaulting.
- Code intelligence milestone: validate Zoekt + Tree-sitter + LanceDB as distinct layers, with fusion and graph linking; avoid generic source-file RAG.
- Observability milestone: implement live event stream, local event storage, OTel semantic naming, and health checks for adapters, sidecars, DBs, indexes, and graph links.
- Runtime milestone: settle Rust/TypeScript/Python process boundaries, supervision, and IPC before broad integration work.
- Desktop/cockpit milestone: use Tauri/web UI only if rich local cockpit is needed; keep local-first CLI OS as core.

## Acceptance Criteria
- New contributor can state which capability each product owns and where Fulcrum remains canonical.
- Default architecture names one winner per capability type and documents fallbacks.
- PM, actions, memory, code intelligence, graph, telemetry, and language/runtime choices form one coherent incremental architecture.
- Fulcrum can run locally without cloud services, Kubernetes, remote databases, or manual sidecar management.
- Local state is inspectable and recoverable from files/databases.
- External PM/workflow/RAG/search products can be swapped or disabled without losing Fulcrum's task/run/event identity.
- Memory ingest supports incremental create/update/delete with provenance and graph links.
- Code intelligence returns fused lexical, structural, and semantic results and links them to plans/tasks/runs/artifacts.
- Graph correctness does not depend on full rebuilds after normal changes.
- Health reports cover PM adapter, action runner, RAG engine, code indexes, graph links, local DBs, and sidecars.

## Risks / Open Questions
- Plane may be too heavy or too hard to customize for local PM cockpit needs; research footprint, APIs, and UI customization.
- Windmill local/embedded deployment may not fit workstation defaults; research minimum viable local setup.
- LightRAG may fail delete/rename/provenance/linkability gates in live repositories.
- LanceDB Rust/TypeScript maturity may affect local hybrid retrieval and fusion design.
- Rust/TypeScript/Python process boundary and IPC protocol remain unresolved.
- Duplicate graph/vector responsibilities could emerge between LightRAG, LanceDB, and Fulcrum OS graph; gate must prove non-overlap.
- Sidecar lifecycle must be supervised by Fulcrum; user-managed services would violate default install goals.
- Markdown and code are early/mid-stage primary inputs; PDF/Office parsing is explicitly out of scope until later.

## Links To Preserve
- Requirements: R1-R21 in source doc.
- Key decisions: Fulcrum owns OS kernel; Rust primary; TypeScript UI/adapters; Python sidecar-only; Plane candidate cockpit; Windmill action/workflow adapter; LightRAG graph distinct from Fulcrum graph; Zoekt + Tree-sitter + LanceDB candidate code intelligence stack.
- Validation gates: Plane local footprint/customization; Windmill local deployment/embedded mode; LightRAG local/offline provenance update/delete/linkability; LanceDB Rust/TypeScript maturity; runtime IPC/process boundary.
- Non-goals: no CLI-agent-specific integrations/plugins/marketplace packaging in this phase; no cloud-only dependencies as defaults; no enterprise/team-server-first target; no duplicate vector stores without validation; no PDF/Office parsing requirement early/mid-stage.
- Architecture diagram entities: Operator, Owned Cockpit UI, Fulcrum Kernel, Local Event Store + OTel Semantics, Plane Adapter, Windmill Adapter, LightRAG Sidecar, Zoekt, Tree-sitter, LanceDB, Fulcrum OS Graph.
