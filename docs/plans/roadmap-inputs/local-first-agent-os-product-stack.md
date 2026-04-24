# Local First Product Stack Roadmap Input
- Source: `/home/mkh/workspace/pi-stack-plan/docs/research/2026-04-24-local-first-agent-os-product-stack.md`

## Must Carry Into Roadmap
- Fulcrum owns canonical local OS kernel, cockpit, identity, state, provenance, adapters, live event stream, context builder, and cross-system linking.
- External products are adapters or sidecars, not sources of truth. Plane is optional PM adapter after gates; older "Plane owns PM cockpit" wording is superseded.
- Default stack to validate: Rust kernel/CLI/daemon/Tauri backend, TypeScript UI/integration surfaces, Python isolated to RAG sidecars.
- Product targets local developer/operator, normal laptop/workstation, local repos, local memory/docs, local-first default, optional self-hosted/team mode later.
- Primary capabilities: memory graph RAG, full-stack code search, graph linking memories/code, PM/orchestration for CLI agents, owned reporting/monitoring/action dashboards.
- Selected capability owners:
  - Plane: optional PM surface adapter for work items, docs/pages, views, dashboards, API/webhooks.
  - Windmill: action/workflow execution, scripts, schedules, webhooks, operator forms/UIs, run logs.
  - LightRAG: memory RAG plus graph RAG.
  - Zoekt: indexed lexical/regex/path code search.
  - Tree-sitter: AST structure, symbols, imports, chunks, incremental parsing.
  - LanceDB: semantic vectors, full-text, SQL-style query, hybrid retrieval/reranking.
  - OpenTelemetry: traces/metrics/logs vocabulary and optional export.
- Keep memory graph RAG and code intelligence separate subsystems linked by Fulcrum IDs.
- Avoid default enterprise/Kubernetes/SaaS/cloud-only posture, overlapping products for same capability, duplicate embeddings/indexes unless justified, and server stacks that make local use feel like ops work.

## Milestone Impacts
- Early product milestones must ship Fulcrum-owned cockpit first; Plane adapter comes only after local footprint, customization, sync, and reversibility gates pass.
- System design work should be framed as spikes, not user-shippable slices; full delivery roadmap should be milestone-based.
- Spike Plane for local install friction, CPU/RAM, API/model fit, pages/docs, views/dashboards, webhooks/events, live agent activity embedding, fork/sidecar viability.
- Spike Windmill for local install, TypeScript/Bash/Python execution, workflows, schedules, webhooks, generated forms/UIs, logs, local CLI calls, clean agent action modeling.
- Spike LightRAG for offline setup, markdown/L0 ingestion, graph relation quality, incremental insert/update/delete, provenance IDs, CPU/local model path, query modes, links to code/PM IDs.
- Spike Zoekt + Tree-sitter + LanceDB together as complementary code intelligence: lexical index, structural chunks, semantic/hybrid retrieval, Fulcrum-ranked context fusion.
- Add SCIP only later if Tree-sitter is too imprecise for references.
- Optional observability export profile can target Grafana/Prometheus/Loki/SigNoz later, but default UI remains Fulcrum domain-specific.

## Acceptance Criteria
- Fulcrum can run useful local-first workflows on normal developer machines without mandatory cloud services.
- Fulcrum cockpit remains canonical even when Plane is installed; Plane sync is reversible and does not own product identity.
- Each external component has one clear capability boundary and can be replaced behind an adapter.
- Windmill-triggered actions can emit Fulcrum run/action events, logs, and PM-linked status.
- LightRAG results preserve provenance and can link back to Fulcrum memory/code/PM IDs.
- Zoekt answers lexical/regex/path queries from local repo indexes with manageable lifecycle.
- Tree-sitter produces stable symbols/imports/chunks across target languages with manageable grammar setup.
- LanceDB local/Node packaging works and improves semantic/hybrid context beyond lexical or AST alone.
- Fulcrum context builder can merge memory, code lexical, AST, semantic, PM, and action signals into ranked context.
- OpenTelemetry instrumentation provides standard trace/event/metric vocabulary without forcing heavy backend install.

## Risks / Open Questions
- Plane may be too heavy for personal local default due to Django/Postgres/Redis/web stack; fallback: Vikunja, then owned cockpit.
- Plane API/model/customization may not represent global/per-project agent task operations or live action streams cleanly.
- Windmill may overlap with custom runner or be too heavy; fallback: Temporal only for durability needs, owned lightweight runner if product surface is not worth cost.
- LightRAG Python sidecar creates language/runtime boundary; update/delete/rename correctness, storage footprint, and provenance recovery need validation.
- Zoekt requires index lifecycle ownership; symbol signal may remain shallow without AST/SCIP.
- Tree-sitter requires extraction rules, storage model, and grammar management across languages.
- LanceDB adds another data store/format; Node/TypeScript integration and local packaging need proof.
- Multiple stores/indexes risk duplication; roadmap must define ownership, sync, invalidation, and rebuild paths.
- Open question: exact local machine budget for RAM/CPU/disk across combined stack.
- Open question: first target language set for Tree-sitter and code intelligence acceptance.
- Open question: minimum offline model/Ollama profile for LightRAG and semantic embeddings.

## Links To Preserve
- CE outputs: `docs/ideation/2026-04-24-agent-os-system-design-ideation.md`
- CE outputs: `docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md`
- CE outputs: `docs/plans/2026-04-24-agent-os-system-design-plan.md`
- CE outputs: `docs/ideation/2026-04-24-agent-os-full-product-delivery-ideation.md`
- CE outputs: `docs/brainstorms/2026-04-24-agent-os-full-product-delivery-requirements.md`
- CE outputs: `docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md`
- Plane: https://github.com/makeplane/plane and https://plane.so/open-source
- Windmill: https://github.com/windmill-labs/windmill
- LightRAG: https://github.com/HKUDS/LightRAG and https://arxiv.org/abs/2410.05779
- Zoekt: https://github.com/sourcegraph/zoekt
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- LanceDB: https://github.com/lancedb/lancedb and https://lancedb.com/
- OpenTelemetry: https://opentelemetry.io/
- Fallback/reference alternatives: Vikunja, Huly, Temporal, Activepieces, Kotaemon, Khoj, AnythingLLM, Open WebUI, SCIP, Tabby, sqlite-vec, Kuzu, Neo4j, Memgraph, Grafana, Prometheus, Loki, SigNoz.
