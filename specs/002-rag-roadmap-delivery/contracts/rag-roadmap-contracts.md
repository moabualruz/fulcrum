# Contracts: Fulcrum RAG Roadmap Delivery

**Feature**: [Fulcrum RAG Roadmap Delivery](../spec.md)
**Date**: 2026-04-23

## Contract Rules

- All JSON outputs include `workspace_id` and `project_id` when scoped.
- Mutating repair/rebuild/embed operations require actor capability checks and audit events.
- Read-only plan, health, status, report, trace-read, and eval-readiness commands do not mutate state.
- Absolute paths appear only on explicit operator preflight/report surfaces.
- Agent-facing traces, eval artifacts, events, and memory use path fingerprints and stable source refs.
- Errors use structured `code`, `message`, `details`, and `retryable` fields.

## CLI Surfaces

### RAG Health

Command:

```bash
fulcrum memory doctor --json
fulcrum memory doctor --profile dev --json
```

Output shape:

```json
{
  "workspace_id": "ws_...",
  "project_id": "proj_...",
  "status": "degraded",
  "domains": [
    {
      "domain": "vectors",
      "status": "degraded",
      "required": true,
      "current_count": 120,
      "stale_count": 4,
      "failed_count": 1,
      "out_of_scope_reason": null,
      "next_actions": ["Run fulcrum memory embed --scope code --json"]
    }
  ],
  "runtime_truth": {
    "requested": { "provider": "transformers", "model": "Qwen/Qwen3-Embedding-0.6B", "device": "cuda", "dimensions": 1024 },
    "actual": { "provider": "transformers", "model": "Qwen/Qwen3-Embedding-0.6B", "device": "cpu", "dimensions": 1024 },
    "fallback_allowed": true,
    "fallback_reason": "cuda_unavailable"
  },
  "profile": {
    "name": "dev",
    "path_fingerprints": {
      "db": "sha256:...",
      "vault": "sha256:...",
      "graph": "sha256:...",
      "vectors": "sha256:...",
      "artifacts": "sha256:..."
    }
  }
}
```

### RAG Repair Plan

Command:

```bash
fulcrum memory doctor --repair-plan --profile dev --json
```

Output shape:

```json
{
  "repair_plan_id": "ragrepairplan_...",
  "workspace_id": "ws_...",
  "project_id": "proj_...",
  "status": "planned",
  "clean_slate_required": false,
  "domains": ["fts", "code", "vectors", "graph", "eval_readiness"],
  "mutation_scope": {
    "derived_state_only": true,
    "domains": ["code", "vectors"],
    "canonical_sources_mutated": false
  },
  "required_actions": [
    {
      "action": "embed_code_vectors",
      "command": "fulcrum memory embed --scope code --json",
      "mutating": true,
      "estimated_items": 42,
      "retryable": true
    }
  ],
  "blocking_errors": [],
  "preflight_warnings": []
}
```

Acceptance:
- No DB/vault mutation while producing this output.
- Clean-slate action appears only when explicitly requested or no safe targeted repair exists.

### RAG Rebuild / Repair Execution

Existing command remains primary:

```bash
fulcrum memory rebuild --all --mode plan --profile dev --json
fulcrum memory rebuild --all --mode dry-run --profile dev --json
fulcrum memory rebuild --all --execute --profile dev --json
fulcrum memory rebuild --domain graph --execute --profile dev --json
```

Required output additions:

```json
{
  "report_id": "report_...",
  "status": "completed",
  "mode": "execute",
  "repair_plan_id": "ragrepairplan_...",
  "candidate_disposition": "promoted",
  "final_health_status": "healthy",
  "scope": {
    "domains": ["l0", "l1", "fts", "code", "vectors", "graph"],
    "derived_state_only": true
  },
  "verification": {
    "coverage_complete": true,
    "freshness_complete": true,
    "vector_metadata_consistent": true,
    "graph_coverage_current": true,
    "eval_readiness": "healthy"
  },
  "retryable_actions": []
}
```

### Embedding Jobs

Current command:

```bash
fulcrum memory embed --scope memories --json
fulcrum memory embed --scope l1-pages --json
fulcrum memory embed --scope code --json
fulcrum jobs status <job_id> --json
fulcrum jobs resume <job_id> --json
fulcrum jobs retry <job_id> --failed --json
```

Contract:
- Job creation output must either reach a terminal status after execution or include `next_action` with the exact command required to run/resume it.
- Code scope uses the code embedder path.
- `embedded` counts only rows verified in vector table and metadata.

Output shape:

```json
{
  "job_id": "job_...",
  "status": "degraded",
  "source_domain": "code_chunks",
  "progress": {
    "total": 100,
    "embedded": 97,
    "failed": 3,
    "skipped": 0,
    "stale": 0
  },
  "requested": {
    "provider": "transformers",
    "model": "Qwen/Qwen3-Embedding-0.6B",
    "device": "cuda",
    "dimensions": 1024
  },
  "actual": {
    "provider": "transformers",
    "model": "Qwen/Qwen3-Embedding-0.6B",
    "device": "cpu",
    "dimensions": 1024
  },
  "fallback": {
    "allowed": true,
    "reason": "cuda_unavailable"
  },
  "next_action": "fulcrum jobs retry job_... --failed --json"
}
```

### Unified Context Search

Command:

```bash
fulcrum search context "how is RAG repair wired to code vectors?" --explain --json
```

Action fallback:

```bash
fulcrum action exec search_context --json '{"query":"how is RAG repair wired to code vectors?","limit":10,"explain":true}'
```

Request:

```json
{
  "query": "how is RAG repair wired to code vectors?",
  "workspace_id": "ws_...",
  "project_id": "proj_...",
  "limit": 10,
  "context_budget_tokens": 6000,
  "sources": ["memory", "code", "file", "graph", "task", "decision"],
  "include_graph": true,
  "include_tasks": true,
  "explain": true
}
```

Response:

```json
{
  "query_trace_id": "ragtrace_...",
  "results": [
    {
      "type": "code_chunk",
      "rank": 1,
      "score": 0.92,
      "source_ref": {
        "file_path": "packages/memory/src/l2/code.ts",
        "path_fingerprint": "sha256:...",
        "line_start": 34,
        "line_end": 78,
        "symbol_path": "storeChunkEmbedding"
      },
      "provenance_class": "code_backed",
      "freshness": "current",
      "stage_contributions": [
        { "stage": "code_vector", "rank": 2, "score": 0.81 },
        { "stage": "symbol", "rank": 1, "score": 1.0 }
      ],
      "explanation_status": "complete"
    }
  ],
  "context_pack": {
    "budget_tokens": 6000,
    "used_tokens": 3820,
    "source_diversity": {
      "memory": 3,
      "code_chunk": 4,
      "graph_edge": 2,
      "task": 1
    }
  },
  "skipped_stages": []
}
```

### Code Search Compatibility

Existing action remains:

```bash
fulcrum action exec search_code --json '{"text":"code embedding provider","limit":5}'
```

Required additions:
- `stage_contributions`
- `vector_status`
- `parse_status`
- `line_start` / `line_end`
- `symbol_path`
- `runtime_truth`
- stale/degraded explanation when code vectors are unavailable

### RAG Eval

Existing command extends suites:

```bash
fulcrum memory eval --suite rag-lifecycle --json
fulcrum memory eval --suite live-rag --json
fulcrum memory eval --suite code-rag --json
fulcrum memory eval --suite unified-context --json
```

Output shape:

```json
{
  "eval_run_id": "evalrun_...",
  "suite": "live-rag",
  "status": "failed",
  "readiness": "degraded",
  "thresholds": {
    "recall_at_5": 0.8,
    "provenance_coverage": 1.0,
    "graph_coverage_required": true
  },
  "metrics": {
    "recall_at_5": 0.67,
    "mrr": 0.71,
    "ndcg": 0.74,
    "context_precision": 0.76,
    "context_recall": 0.69,
    "groundedness": 1.0,
    "provenance_coverage": 1.0,
    "latency_p95_ms": 320
  },
  "results": [
    {
      "eval_case_id": "ragevalcase_...",
      "status": "failed",
      "query_trace_id": "ragtrace_...",
      "missing_sources": ["graph:decision_to_code_edge"],
      "failures": [
        { "code": "expected_source_missing", "message": "Required graph edge not retrieved", "retryable": true }
      ]
    }
  ]
}
```

Rules:
- Missing expected cases in a required live domain returns `readiness: degraded` and non-passing status.
- Model-heavy and accelerator-heavy cases run only when explicitly requested.

### Query Trace Read

Command:

```bash
fulcrum memory trace-query <query_trace_id> --json
```

Action:

```bash
fulcrum action exec get_rag_query_trace --json '{"query_trace_id":"ragtrace_..."}'
```

Response:

```json
{
  "query_trace_id": "ragtrace_...",
  "workspace_id": "ws_...",
  "project_id": "proj_...",
  "query_hash": "sha256:...",
  "stages": [
    {
      "name": "code_vector",
      "status": "ok",
      "candidate_count": 40,
      "limit": 50,
      "latency_ms": 42
    }
  ],
  "fusion": {
    "method": "rrf",
    "input_candidates": 120,
    "output_candidates": 30
  },
  "rerank": {
    "status": "ok",
    "candidate_limit": 30,
    "latency_ms": 80
  },
  "runtime_truth": {
    "requested": {},
    "actual": {},
    "fallback": null
  },
  "redaction_summary": {
    "absolute_paths_redacted": true,
    "secrets_redacted": true
  }
}
```

## MCP / Action Tool Parity

Required public tools:

- `get_rag_health`: existing, extended with `out_of_scope`, eval readiness, and runtime truth.
- `get_rag_rebuild_plan`: existing, remains read-only.
- `get_rag_rebuild_dry_run`: existing, remains read-only simulation.
- `start_rag_rebuild`: existing, mutating and capability-gated.
- `get_rag_rebuild_report`: existing, read-only.
- `search_code`: existing, enhanced but backward compatible.
- `search_context`: new agent-preferred unified retrieval surface.
- `run_rag_eval`: new or existing action wrapper for `memory eval` suites.
- `get_rag_query_trace`: new read-only trace retrieval.
- `get_rag_repair_plan`: new dedicated read-only repair-plan tool. `get_rag_health` stays focused on current health.

Tool registry rules:
- Public tools need complete capability metadata.
- Read tools set `readOnlyHint: true`.
- Mutating tools must not claim read-only.
- Tool names are snake_case.

## Error Envelope

```json
{
  "error": {
    "code": "runtime_device_unavailable",
    "message": "Explicit requested device is unavailable",
    "details": {
      "requested_device": "cuda",
      "available_devices": ["cpu"]
    },
    "retryable": false
  }
}
```

Common error codes:
- `runtime_profile_required`
- `runtime_profile_unsafe`
- `actor_lacks_rag_maintenance_capability`
- `runtime_device_unavailable`
- `vector_metadata_mismatch`
- `graph_coverage_stale`
- `eval_expected_cases_missing`
- `query_stage_unavailable`
- `context_budget_exceeded`
- `path_scope_violation`
- `secret_redacted`
