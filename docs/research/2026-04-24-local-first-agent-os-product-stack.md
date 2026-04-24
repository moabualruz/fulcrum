# Local-First CLI Agent OS Product Stack Research

Date: 2026-04-24
Status: research draft

## CE Workflow Outputs

This recovered research document now feeds the fresh CE planning pass:

- `docs/ideation/2026-04-24-agent-os-system-design-ideation.md`
- `docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md`
- `docs/plans/2026-04-24-agent-os-system-design-plan.md`

Current synthesis:

- Fulcrum should own a small local OS kernel and canonical state.
- External products should be adapters or sidecars, not source-of-truth owners.
- Rust should be the primary kernel/CLI/daemon/Tauri backend language.
- TypeScript should own UI and product-facing integration surfaces.
- Python should be isolated to RAG sidecars such as LightRAG.
- Memory graph RAG and code intelligence remain separate subsystems linked by Fulcrum IDs.

## Goal

Assume a new project from zero.

Goal is not to protect existing technical choices. Goal is to build a local-first CLI agent operating system that runs reliably on normal developer machines, delivers high value, and minimizes reinvention by integrating strong open-source products/projects.

Target user:

- individual developer/operator
- normal laptop/workstation
- local repositories
- local memory/docs
- local-first by default
- optional self-hosted/team mode later

Primary product capabilities:

1. memory: RAG + graph
2. code search: full-stack AST + lexical + semantic + graph
3. graph linking memories and code
4. PM/orchestration for CLI agents
5. owned dashboards/reporting/monitoring/action orchestration

Do not optimize now for:

- enterprise deployment
- Kubernetes-first stack
- SaaS sync as core workflow
- huge team governance
- cloud-only services

## Selection Principles

Use products/projects when they cover whole capability areas.

Prefer:

- open source
- local-first or easy local self-host
- one binary or one container where possible
- strong APIs
- active maintenance
- embeddable or controllable from CLI
- can be replaced behind an adapter
- high product value per integration line
- dominance over narrow alternatives

Avoid:

- many overlapping products for same data
- duplicate embeddings/indexes unless explicitly justified
- server stacks that require ops mindset for default use
- products that own too much of Fulcrum's core identity
- cloud requirement for normal operation

Dominance rule:

- If one candidate covers multiple required capabilities well, it wins over candidates that cover only one of those capabilities.
- Narrow candidates stay only when the broader candidate does not cover a required capability to acceptable quality.
- "More features" wins only when the extra features are part of this product's target. Irrelevant enterprise breadth does not count.
- The result should be one chosen tool per capability type, plus complementary tools where the types are genuinely different.

## Dominance Map

| Capability Type | Winner | Dropped / Deferred | Why Winner Dominates |
|---|---|---|---|
| PM cockpit + work items + project docs/views | Plane | Vikunja, Huly | Plane covers PM depth, views, pages, APIs, webhooks, dashboards. Vikunja is lighter but narrower. Huly is broader, but much of that breadth is outside target. |
| Workflow/action orchestration + scripts + operator UIs/logs | Windmill | Temporal, Activepieces | Windmill covers scripts, workflows, schedules, webhooks, forms/UIs, logs. Temporal covers durable execution only. Activepieces covers connector automation more than developer action orchestration. |
| Memory RAG + graph RAG | LightRAG | Kotaemon, Khoj, AnythingLLM, Kuzu/Neo4j/Memgraph as default | LightRAG covers the required RAG+graph axis directly. Others are UI/personal assistant products or graph stores that would need more custom RAG logic. |
| Code lexical search | Zoekt | OpenGrok, ripgrep as backend | Zoekt is a product-grade code search engine with indexing, query model, ranking, API/server paths. ripgrep remains ad-hoc fallback, not system index. |
| Code structure / AST | Tree-sitter | Universal Ctags, SCIP as default | Tree-sitter covers incremental parsing and structural chunking. Ctags is narrower. SCIP is more precise but heavier and language-indexer dependent. |
| Semantic + hybrid retrieval store | LanceDB | sqlite-vec, Chroma | LanceDB covers vector, full-text, SQL-style query, and hybrid retrieval in one component. sqlite-vec is smaller but vector-only, so it makes us build more fusion. |
| Observability data model | OpenTelemetry | Grafana/SigNoz/Prometheus/Loki as default | OpenTelemetry gives standard traces/metrics/logs without forcing a heavy backend. Dashboards stay product-specific unless export is needed. |
| Live agent dashboard | Plane + Windmill + owned thin live panel | Grafana generic dashboards | Agent OS needs domain-specific live task/run/action panels. Generic observability dashboards cannot own PM operations. |

## Consolidated Stack

Chosen default research stack:

```text
Plane
  -> PM cockpit, project/task/issue views, pages/docs, dashboards, webhooks/API

Windmill
  -> action orchestration, scripts, workflows, schedules, operator forms/UIs, run logs

LightRAG
  -> memory RAG and graph RAG

Zoekt
  -> indexed code lexical/regex/search API

Tree-sitter
  -> code structure, symbols, imports, AST chunks, incremental parsing

LanceDB
  -> semantic vectors + full-text + hybrid retrieval for code/docs where LightRAG/Zoekt do not cover it

OpenTelemetry
  -> standard trace/event/metrics vocabulary and optional export

Owned thin integration layer
  -> identity, adapters, provenance, live event stream, memory-code-PM linking, context builder
```

Why this is not duplicate:

- Plane owns PM cockpit.
- Windmill owns action/workflow execution.
- LightRAG owns memory graph RAG.
- Zoekt owns lexical code search.
- Tree-sitter owns AST/structure.
- LanceDB owns semantic/hybrid retrieval.
- OpenTelemetry owns observability schema.
- Fulcrum owns the OS semantics that connect them.

Candidates removed from default:

- Vikunja: lighter than Plane, but Plane covers more of the PM/project surface.
- Huly: too broad outside target despite broad coverage.
- Temporal: excellent durable execution, but Windmill covers action orchestration plus UI/logs/schedules; revisit only if durability beats product surface.
- Activepieces: connector automation, not core local agent OS orchestration.
- Kotaemon/Khoj/AnythingLLM/Open WebUI: useful RAG/chat products, but LightRAG better matches memory+graph engine need.
- sqlite-vec: excellent minimal vector extension, but LanceDB covers more retrieval area.
- Kuzu/Neo4j/Memgraph: graph stores, not full memory graph RAG products by themselves.
- Grafana/SigNoz stack: optional export backend, not PM/agent cockpit.

## PM Cockpit Candidates

### Plane

Source:

- https://github.com/makeplane/plane
- https://plane.so/open-source

What it gives:

- projects
- work items
- cycles/sprints
- modules
- pages/docs
- layouts/views
- intake
- dashboards
- estimates
- REST API
- webhooks
- modern Linear/Jira-style product feel

Why it matters:

- It is closest to the owned Linear/Jira/GitHub Projects-style cockpit.
- It covers a big product area that would take a long time to rebuild.
- Plane Community Edition is AGPL and self-hostable.
- Current docs claim modest deployment requirements: Docker/Kubernetes/Podman/Coolify, around 2 CPU cores and 4GB RAM.

Risks:

- Still a server product.
- Django/Postgres/Redis/web stack may be heavier than ideal for personal local default.
- Agent-specific live action streams are not native; would require extension/fork/sidecar UI.
- Commercial edition gates some governance/scale features.

Best use:

- PM cockpit base if we are willing to run one substantial local app.
- Fork or sidecar integration for agent-specific live panels.

Verdict:

- strongest PM product candidate.

### Vikunja

Source:

- https://vikunja.io/

What it gives:

- open-source task/project manager
- list, Kanban, Gantt, table views
- self-hostable
- simpler personal-task orientation

Why it matters:

- Much lighter PM feel than Plane/Huly.
- Better match for normal person's local machine if simplicity beats product depth.
- It may be easier to adapt as a personal agent-task cockpit.

Risks:

- Less like GitHub Projects/Linear/Jira at full software-project depth.
- May need more custom work for epics/plans/reviews/agent execution views.

Best use:

- lightweight local PM cockpit.

Verdict:

- best low-friction PM candidate.

### Huly

Source:

- https://github.com/hcengineering/platform
- https://huly.io/

What it gives:

- all-in-one platform: project management, chat, CRM, HRM, ATS
- typed API client
- self-host path
- ambitious Linear/Jira/Slack/Notion replacement positioning

Why it matters:

- Broadest all-in-one product surface.
- Could cover PM + collaboration + docs.

Risks:

- Too broad for local single-developer default.
- Self-hosting likely heavier than Plane/Vikunja.
- Owning many unrelated business apps is not our product goal.

Verdict:

- investigate only if "all-in-one workspace" becomes more important than local simplicity.

## Workflow / Action Orchestration Candidates

### Windmill

Source:

- https://github.com/windmill-labs/windmill

What it gives:

- scripts become workflows, webhooks, scheduled jobs, and UIs
- TypeScript/Python/Go/Bash/SQL support
- code-first internal tool/product surface
- logs and run history
- self-hostable open-source platform

Why it matters:

- Covers action orchestration better than building a custom workflow UI from scratch.
- Fits CLI-agent OS because many actions are scripts/workflows.
- Can expose user-triggerable forms/UIs around actions.
- Bridges "PM interface" and "operator action execution."

Risks:

- Still a server product.
- Could overlap with custom workflow engine if we build both.
- Agent-specific task/run model still needs our domain layer.

Best use:

- action/workflow execution substrate, especially for operator-triggered automations.

Verdict:

- strongest action orchestration product candidate.

### Temporal

Source:

- https://temporal.io/

What it gives:

- durable execution
- retries
- timers
- long-running workflow correctness
- strong SDK model

Why it matters:

- Best when correctness of long-running jobs matters more than UI/product surface.
- Good for multi-step jobs that must survive crashes.

Risks:

- Self-hosting requires server plus persistence store; advanced visibility often needs search index.
- Not a PM cockpit or action UI by itself.
- More infra than needed for simple local workflows.

Verdict:

- not first default. Revisit if durable workflow semantics become critical.

### Activepieces

Source:

- https://www.activepieces.com/
- https://github.com/activepieces/activepieces

What it gives:

- open-source automation/Zapier-style flow builder
- many connectors
- friendly UI

Why it matters:

- Strong if external SaaS automations become important.

Risks:

- Connector automation is not core local agent OS.
- Less code-first than Windmill for developer workflows.

Verdict:

- later connector automation candidate.

## Memory / RAG Candidates

### LightRAG

Source:

- https://github.com/HKUDS/LightRAG
- https://arxiv.org/abs/2410.05779

What it gives:

- graph-enhanced RAG
- local/offline install profiles
- retrieval modes over local/global/hybrid/mix concepts
- Ollama local model path documented

Why it matters:

- It attacks exactly the memory + graph RAG part.
- Could reduce reinvention of graph-based memory retrieval.
- Better fit than full server RAG products for local-first engine work.

Risks:

- Python boundary if main app is TypeScript.
- Need verify update/delete/rename semantics for live coding.
- Need verify storage backend footprint.
- Code search still needs separate AST/exact search layer.

Verdict:

- top memory/RAG engine candidate.

### Kotaemon

Source:

- https://github.com/Cinnamon/kotaemon

What it gives:

- clean RAG UI
- document QA
- local LLM support through Ollama/llama-cpp-python
- hybrid full-text + vector retrieval + reranking
- developer framework for custom RAG pipelines

Why it matters:

- Strong ready-made RAG app/UI.
- More productized than LightRAG.
- Good for seeing and debugging retrieval behavior.

Risks:

- Document QA product, not agent OS memory graph.
- UI/domain may not match code+PM+agent needs.

Verdict:

- fallback RAG UI/pipeline candidate if LightRAG lacks usable inspection/debug surfaces.

### Khoj

Source:

- https://github.com/khoj-ai/khoj

What it gives:

- personal AI second brain
- self-hostable
- docs/web answers
- agents
- scheduled automations
- Obsidian/markdown-oriented ecosystem
- local/offline model support paths

Why it matters:

- Very close to personal local memory assistant.
- Could cover personal memory/search/assistant workflows.

Risks:

- May own too much assistant UX.
- Code intelligence and PM orchestration still separate.

Verdict:

- strong personal memory product candidate.

### AnythingLLM / Open WebUI

Sources:

- https://github.com/Mintplex-Labs/anything-llm
- https://openwebui.com/

What they give:

- local AI chat interface
- document chat/RAG
- Ollama/local model integration
- multi-provider LLM setup

Why they matter:

- Good local AI UX.
- Easy way to give normal users model/chat/document interface.

Risks:

- Not enough for code graph, PM cockpit, or agent OS.
- RAG quality may be generic.

Verdict:

- useful UI/model gateway candidates, not core OS.

## Code Search / Code Intelligence Candidates

### Zoekt

Source:

- https://github.com/sourcegraph/zoekt

What it gives:

- fast trigram code search
- local repo indexing
- command-line search
- web server
- JSON API
- BM25 scoring
- context lines
- ctags symbol signal

Why it matters:

- It is a mature product-grade code search component.
- It solves exact/lexical/regex code search better than custom FTS alone.
- It runs locally and can be used from CLI.

Risks:

- Needs index lifecycle integration.
- Symbol intelligence depends on ctags unless paired with better AST layer.
- Semantic code search still separate.

Verdict:

- top code lexical search candidate.

### Tree-sitter

Source:

- https://github.com/tree-sitter/tree-sitter

What it gives:

- incremental parsing
- concrete syntax trees
- query system
- many language grammars

Why it matters:

- Code search needs AST, not just text.
- Tree-sitter can generate symbol/chunk/import data locally and incrementally.

Risks:

- We still need extraction rules and storage model.
- Cross-language coverage requires grammar management.

Verdict:

- required foundation for code intelligence.

### SCIP / Sourcegraph Indexers

Sources:

- https://sourcegraph.com/blog/announcing-scip
- https://sourcegraph.com/docs/code-search/code-navigation/writing_an_indexer

What it gives:

- code intelligence protocol
- precise definitions/references when language indexers exist
- cross-language ecosystem from Sourcegraph

Why it matters:

- Better than AST-only for precise references.
- Could avoid inventing code-intel data model.

Risks:

- More setup per language.
- Might be too much for local default.

Verdict:

- later precision layer after Tree-sitter/Zoekt baseline.

### Tabby

Source:

- https://github.com/TabbyML/tabby
- https://www.tabbyml.com/

What it gives:

- self-hosted AI coding assistant
- local-first deployment positioning
- repo context for coding assistant workflows

Why it matters:

- It is closer to "AI coding assistant server" than raw code search.
- Could cover some code context and model-serving workflows.

Risks:

- Overlaps with CLI agents rather than OS substrate.
- We are ignoring agent integrations for this research pass.

Verdict:

- watch, but not core substrate unless code intelligence APIs are strong enough.

## Vector / Hybrid Retrieval Candidates

### LanceDB

Source:

- https://github.com/lancedb/lancedb
- https://lancedb.com/

What it gives:

- embedded/local vector database
- vector search
- full-text search
- SQL-style query
- hybrid retrieval with reranking

Why it matters:

- It can cover semantic retrieval and hybrid search in one local component.
- Better product boundary than writing vector+hybrid search ourselves.

Risks:

- Adds second data store/format.
- Need verify Node/TypeScript integration and local packaging.

Verdict:

- top hybrid retrieval store candidate.

### sqlite-vec

Source:

- https://github.com/asg017/sqlite-vec

What it gives:

- SQLite vector extension
- pure C, small footprint
- Node usage with `better-sqlite3`
- KNN over vectors

Why it matters:

- Best minimal local-first vector path.
- Keeps state in SQLite family.

Risks:

- Vector only; hybrid fusion is still ours.
- May not match LanceDB for hybrid/reranking product value.

Verdict:

- fallback minimal vector candidate if LanceDB is too heavy or unreliable locally.

## Observability / Dashboards Candidates

### OpenTelemetry

Source:

- https://opentelemetry.io/

What it gives:

- standard traces, metrics, logs model
- SDKs
- collector
- backend-neutral instrumentation

Why it matters:

- Use it as event/trace schema and export path.
- Avoid inventing generic observability protocols.

Risks:

- Collector/backend setup can become heavy.
- Agent OS needs domain-specific dashboards, not generic spans only.

Verdict:

- use data model/instrumentation; do not force full backend default.

### Grafana / Prometheus / Loki / SigNoz

What they give:

- metrics dashboards
- logs/traces visualization
- alerting

Why they matter:

- Strong if operator wants standard observability.

Risks:

- Generic observability does not replace agent PM cockpit.
- Stack can get heavy quickly.

Verdict:

- optional export/viewing profile, not default UI.

## Chosen Stack To Validate

Validate one consolidated stack:

```text
Plane
+ Windmill
+ LightRAG
+ Zoekt
+ Tree-sitter
+ LanceDB
+ OpenTelemetry model
+ thin Fulcrum OS integration layer
```

The stack is allowed to have multiple tools only because each owns a different capability type. It is not allowed to have multiple tools competing inside the same type.

## Validation Plan

### Spike 1: Plane As PM Cockpit

Do not compare three PM products first. Plane wins the first pass by dominance.

Test Plane for:

- local install friction
- RAM/CPU on normal machine
- API completeness
- project/task/issue model fit
- pages/docs fit
- views/dashboards fit
- webhooks/events
- ability to show or embed live agent activity
- ability to fork or sidecar UI safely

Fail Plane only if:

- local runtime cost is unacceptable
- API blocks core agent OS flows
- UI customization is too hard
- model cannot represent global/per-project agent task operations

Fallback if Plane fails:

- Vikunja for lighter PM
- owned cockpit if no PM product can represent agent operations

### Spike 2: Windmill As Action Orchestrator

Test Windmill for:

- local install friction
- TypeScript/Bash/Python script execution
- workflow composition
- schedules
- webhooks
- generated forms/UIs
- run logs
- calling local CLI tools
- representing agent OS actions cleanly

Fail Windmill only if:

- it is too heavy for normal local machines
- scripts/workflows cannot model agent OS actions cleanly
- integration with PM cockpit/live event stream is awkward

Fallback if Windmill fails:

- Temporal only if durable workflow correctness is the missing requirement
- owned lightweight runner only if product surface is not worth the weight

### Spike 3: LightRAG As Memory + Graph RAG

Test LightRAG for:

- local/offline setup
- markdown/L0 ingestion
- graph relation quality
- incremental insert/update/delete
- provenance IDs
- CPU/local model path
- query modes and answer quality
- ability to link memory results to code/PM IDs

Fail LightRAG only if:

- update/delete correctness is weak
- local runtime is too heavy
- provenance is not recoverable
- graph output cannot link to code/PM model

Fallback if LightRAG fails:

- Kuzu/LanceDB custom pipeline only after confirming no broader product works

### Spike 4: Zoekt + Tree-sitter + LanceDB For Code Intelligence

These are complementary, not duplicates.

Test:

- Zoekt indexes repo and answers lexical/regex/path/symbol-ish queries.
- Tree-sitter extracts stable functions/classes/imports/chunks.
- LanceDB stores semantic vectors and hybrid-searches code/doc chunks.
- Fulcrum fusion can merge these into one ranked context.

Fail conditions:

- Zoekt lifecycle/index format is too hard to own locally.
- Tree-sitter grammar management is too costly.
- LanceDB Node/local packaging is not reliable.
- Fusion cannot produce better context than current approach.

Fallbacks:

- replace Zoekt with SQLite FTS5 only if Zoekt is too heavy
- replace LanceDB with sqlite-vec only if LanceDB is too heavy
- add SCIP later only if Tree-sitter is too imprecise for references

## Final Research Bias

Use broad products where they dominate:

- Plane over Vikunja/Huly for PM cockpit.
- Windmill over Temporal/Activepieces for action orchestration.
- LightRAG over standalone graph stores and generic RAG chat apps for memory+graph RAG.
- LanceDB over sqlite-vec/Chroma for semantic+hybrid retrieval.

Keep narrow tools only when they own unique required capability:

- Zoekt owns code lexical search.
- Tree-sitter owns AST/structure.
- OpenTelemetry owns standard trace/event vocabulary.

This is the first stack to validate. Alternatives are fallback paths, not parallel recommendations.

## Sources

- Plane: https://github.com/makeplane/plane and https://plane.so/open-source
- Vikunja: https://vikunja.io/
- Huly: https://github.com/hcengineering/platform and https://huly.io/
- Windmill: https://github.com/windmill-labs/windmill
- Temporal: https://temporal.io/
- LightRAG: https://github.com/HKUDS/LightRAG and https://arxiv.org/abs/2410.05779
- Kotaemon: https://github.com/Cinnamon/kotaemon
- Khoj: https://github.com/khoj-ai/khoj
- Zoekt: https://github.com/sourcegraph/zoekt
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- SCIP: https://sourcegraph.com/blog/announcing-scip
- LanceDB: https://github.com/lancedb/lancedb
- sqlite-vec: https://github.com/asg017/sqlite-vec
- OpenTelemetry: https://opentelemetry.io/
