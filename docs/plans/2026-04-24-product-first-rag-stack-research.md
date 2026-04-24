# Product-First RAG Stack Experiment

Date: 2026-04-24
Branch: `experiment/product-first-rag-stack`

## Thesis

Fulcrum should stop owning engine behavior where ready products already cover the requirement. Fulcrum should become the control plane that manages product configuration, profiles, credentials, policy, provenance, progress, and recovery.

Priority order:

1. Products that cover multiple Fulcrum requirements end-to-end.
2. Products that are easy to run locally or self-host.
3. Products with APIs/SDKs Fulcrum can orchestrate and health-check.
4. Libraries only when no product-level option fits.

## Recommended Stack

### 1. Primary RAG Product: Dify

Use Dify as the first experiment for knowledge bases, workflow orchestration, retrieval configuration, and app-level RAG management.

Why first:

- It already has knowledge-base workflows, chunking/segmentation choices, vector retrieval, and visual orchestration.
- It is closer to the desired product shape than a bare framework.
- Fulcrum can manage it through project profiles, dataset/app provisioning, sync jobs, and health checks.

Fulcrum owns:

- Workspace/project mapping to Dify dataset/app IDs.
- L0 export/import into Dify knowledge bases.
- Reindex job orchestration.
- Policy gates before sync or destructive rebuild.
- Provenance ledger mapping Fulcrum source IDs to Dify document/chunk IDs.

Replace/delete candidates:

- Most custom code indexing daemon behavior.
- Custom chunk management where Dify knowledge pipeline suffices.
- Bespoke retrieval fusion for user-facing RAG flows.

Sources:

- Dify knowledge pipeline orchestration docs: https://docs.dify.ai/en/guides/knowledge-base/knowledge-pipeline/knowledge-pipeline-orchestration

### 2. Retrieval Engine: Qdrant

Use Qdrant as the default self-hosted retrieval engine where Dify’s built-in store is insufficient or where Fulcrum needs direct retrieval APIs.

Why:

- Product-level vector DB with dense+sparse hybrid retrieval, metadata filtering, multivector support, and real-time updates.
- Strong local/self-host story and cloud option.
- Covers much of our custom vector + hybrid retrieval work.

Fulcrum owns:

- Collection lifecycle per workspace/project.
- Schema versioning for payload fields.
- Import/export from L0/L1/source docs.
- Query policies and audit.

Replace/delete candidates:

- `vec_chunks`, `vec_memories`, vector metadata reconciliation as primary serving path.
- Custom dense/sparse fusion logic where Qdrant Query API can do it server-side.

Sources:

- Qdrant hybrid search / dense-sparse support: https://qdrant.tech/articles/hybrid-search/
- Qdrant product page: https://qdrant.tech/

### 3. Durable Pipeline Runner: Temporal

Use Temporal for long-running ingest/reindex/embed/repair workflows.

Why:

- Durable execution, retries, timers, task queues, pause/resume semantics are product features.
- Our indexing/rebuild scripts are already becoming workflow engines. That should stop.

Fulcrum owns:

- Workflow definitions and parameters.
- Operator CLI/TUI controls.
- Policy checks before starting workflows.
- Cross-product health summary.

Replace/delete candidates:

- Custom daemon retry loops.
- Hand-rolled progress and resume state.
- Embedding job lifecycle tables, except as compatibility mirror.

Sources:

- Temporal durable execution overview: https://temporal.io/

### 4. Connectors/Ingestion: Airbyte

Use Airbyte when ingestion sources expand beyond local files/git.

Why:

- Product-level connector management, scheduling, sync frequency, APIs, and hundreds of connectors.
- Stronger than building source-specific importers.

Fulcrum owns:

- Which connectors are enabled for a workspace.
- Credential policy and secret scanning.
- Sync-to-RAG destination mapping.
- Provenance mapping from connector records to Dify/Qdrant documents.

Replace/delete candidates:

- Future custom connectors.
- One-off import jobs for SaaS systems.

Sources:

- Airbyte docs: https://docs.airbyte.com/
- Airbyte connector/product page: https://airbyte.com/connectors/airbyte

### 5. Document Parsing Product: Unstructured or LlamaCloud

Use a parsing product for PDFs, screenshots, Office docs, and layout-heavy material.

Recommendation:

- Try LlamaCloud first if managed parsing/retrieval is acceptable.
- Try Unstructured when self-host / ETL style processing is required.

Fulcrum owns:

- Routing files to parser product.
- Storing raw source refs and parser output refs.
- Quality gates and retry policy.

Replace/delete candidates:

- Custom document parsing/chunking beyond code/text.
- Future OCR/layout/table extraction code.

Sources:

- LlamaCloud managed parsing/ingestion/retrieval docs: https://docs.cloud.llamaindex.ai/
- LlamaCloud index docs: https://docs.llamaindex.ai/en/stable/module_guides/indexing/llama_cloud_index/

### 6. Observability/Evals: Langfuse

Use Langfuse for traces, prompts, evals, datasets, experiments, annotation, and production feedback.

Why:

- Product-level observability and eval loop.
- Open-source/self-hostable with OpenTelemetry alignment.
- Avoids building bespoke eval dashboards and trace stores.

Fulcrum owns:

- Trace metadata conventions.
- Linking runs/tasks/workspaces to Langfuse sessions.
- Local health summary and eval gate enforcement.

Replace/delete candidates:

- Custom trace/eval reporting UIs.
- Some bespoke eval persistence.

Sources:

- Langfuse product page: https://langfuse.com/
- Langfuse GitHub: https://github.com/langfuse/langfuse

### 7. GraphRAG Product: Neo4j GraphRAG

Use Neo4j GraphRAG only if graph retrieval remains a hard requirement after Dify/Qdrant evaluation.

Why:

- Provides graph + vector + fulltext retrieval patterns and graph traversal.
- More productized graph management than custom SQLite/Kuzu evidence coverage.

Concern:

- Adds a second serving database next to vector/search product.
- Should not be default unless graph retrieval proves measurable value.

Fulcrum owns:

- Graph source-of-truth mapping.
- Sync from product retrieval corpus to graph.
- Cypher query templates and access policy.

Replace/delete candidates:

- Custom graph coverage/reducer engine.
- Bespoke graph retrieval expansion.

Sources:

- Neo4j GraphRAG package overview: https://neo4j.com/blog/news/graphrag-python-package/
- Microsoft Agent Framework Neo4j GraphRAG context provider: https://learn.microsoft.com/en-us/agent-framework/integrations/neo4j-graphrag

## Migration Plan

### Phase 0: Freeze Bespoke Expansion

No new custom memory engine features unless they are compatibility glue for product migration.

### Phase 1: Product Adapters

Add adapters:

- `DifyKnowledgeAdapter`
- `QdrantRetrievalAdapter`
- `TemporalWorkflowAdapter`
- `LangfuseTelemetryAdapter`

Adapters expose:

- `provision(workspace, project)`
- `syncSource(sourceRef)`
- `query(request)`
- `health()`
- `deleteProject(projectRef)`

### Phase 2: Externalize Serving

Route new `search_context` / `search_code` experiments through Dify or Qdrant behind flags.

Keep current SQLite/Kuzu paths read-only as baseline until evals prove replacement.

### Phase 3: Durable Reindex

Move `scripts/reindex-project-all.ts` behavior into Temporal workflow:

1. Preserve/import L0.
2. Sync docs to Dify/Qdrant.
3. Trigger parsing/embedding.
4. Verify counts and retrieval smoke tests.
5. Report into Langfuse/Fulcrum.

### Phase 4: Delete Custom Engines

After parity:

- Remove custom vector metadata serving path.
- Remove custom code embedding job worker.
- Remove custom graph reducer/coverage path unless Neo4j adapter replaces it.
- Keep only export/import and provenance ledger tables.

## Decision Matrix

| Need | First Product | Backup | Fulcrum Responsibility |
|---|---|---|---|
| RAG app/KB/workflow | Dify | Haystack Enterprise / LlamaCloud | Provision, policy, provenance |
| Hybrid retrieval | Qdrant | Weaviate / OpenSearch | Collection lifecycle, health |
| Durable jobs | Temporal | Hatchet / Inngest / Trigger.dev | Workflow launch, policy |
| SaaS/data connectors | Airbyte | Unstructured connectors / custom | Credential policy, sync mapping |
| Parsing/OCR/layout | LlamaCloud | Unstructured | Parser routing and audit |
| Observability/evals | Langfuse | LangSmith / Phoenix | Metadata and eval gates |
| GraphRAG | Neo4j GraphRAG | Memgraph / Kuzu | Graph sync and access policy |

## Immediate Experiment

Build a disposable Docker Compose stack:

- Dify
- Qdrant
- Temporal
- Langfuse

Then implement one Fulcrum command:

```bash
fulcrum product-rag sync --workspace-id ... --project-id ...
```

Success criteria:

- Imports all L0 raw sources.
- Indexes project text/code documents.
- Embeds without local ONNX dependency unless explicitly configured.
- Shows progress through Temporal.
- Stores traces/eval runs in Langfuse.
- Lets Fulcrum doctor report product health from APIs, not internal tables.

## Default Recommendation

Start with Dify + Qdrant + Temporal + Langfuse. Add Airbyte when non-git connectors matter. Add Neo4j GraphRAG only after retrieval evals prove graph traversal improves answer quality enough to justify another product.
