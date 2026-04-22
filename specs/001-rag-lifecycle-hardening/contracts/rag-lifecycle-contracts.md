# Contracts: Fulcrum RAG Lifecycle Hardening

These contracts define expected CLI/MCP JSON shapes. Exact command names may change during implementation, but fields and semantics should remain stable.

## Reset And Rebuild

### Command

```bash
fulcrum memory rebuild --all --mode plan --json
fulcrum memory rebuild --all --mode dry-run --json
fulcrum memory rebuild --all --execute --json
```

### Request Shape

```json
{
  "workspace_id": "ws_...",
  "project_id": "proj_...",
  "actor": {
    "kind": "agent",
    "role": "memory_curator",
    "id": "agent_..."
  },
  "mode": "plan",
  "domains": ["l0", "l1", "fts", "code", "vectors", "graph"],
  "embed": false,
  "allow_empty": false
}
```

### Plan Response Shape

```json
{
  "report_id": "report_...",
  "status": "completed",
  "mode": "plan",
  "scope": {
    "workspace_id": "ws_...",
    "project_id": "proj_...",
    "domains": ["l0", "l1", "fts", "code", "vectors", "graph"]
  },
  "candidate": null,
  "counts": {
    "raw_files": 0,
    "l0_sources": 0,
    "memory_files": 0,
    "memories": 0,
    "code_files": 0,
    "code_chunks": 0,
    "vectors": 0,
    "graph_entities": 0,
    "graph_edges": 0
  },
  "parity": [],
  "warnings": [],
  "errors": [],
  "artifact_path": null
}
```

### Execute Response Shape

```json
{
  "report_id": "report_...",
  "status": "completed",
  "mode": "execute",
  "scope": {
    "workspace_id": "ws_...",
    "project_id": "proj_...",
    "domains": ["l0", "l1", "fts", "code", "vectors", "graph"]
  },
  "candidate": {
    "candidate_id": "candidate_...",
    "status": "promoted",
    "disposition": "promoted",
    "input_snapshot_id": "snapshot_...",
    "input_snapshot_status": "current",
    "served_state_unchanged": false
  },
  "counts": {
    "raw_files": 0,
    "l0_sources": 0,
    "memory_files": 0,
    "memories": 0,
    "code_files": 0,
    "code_chunks": 0,
    "vectors": 0,
    "graph_entities": 0,
    "graph_edges": 0
  },
  "parity": [
    {
      "name": "code_chunks_file_id",
      "status": "pass",
      "expected": 0,
      "actual": 0
    }
  ],
  "warnings": [],
  "errors": [],
  "artifact_path": null
}
```

Rules:
- `mode=plan` and `mode=dry-run` must not mutate.
- `execute` must require explicit workspace/project scope and actor authorization.
- Destructive execution is allowed only for human operators, `chief_of_staff`, `memory_curator`, or roles with write-code/edit-file capability.
- Full rebuild execution must build staged or quarantined candidate state and promote it only after all required checks pass.
- Full rebuild execution must snapshot canonical source identities and content hashes at start and revalidate that snapshot before promotion.
- If canonical sources change before promotion, the candidate must fail promotion and remain unserved.
- A failed candidate must not be served by recall or code search; the previously served derived state remains current.
- Failure status must include machine-readable failed checks.

## Embedding Job

### Command

```bash
fulcrum memory embed --scope memories --json
fulcrum memory embed --scope l1-pages --json
fulcrum memory embed --scope code --json
fulcrum jobs status job_... --json
fulcrum jobs logs job_... --json
fulcrum jobs cancel job_... --json
fulcrum jobs resume job_... --json
fulcrum jobs retry job_... --failed --json
```

### Start Response

```json
{
  "job_id": "job_...",
  "status": "pending",
  "source_domain": "memories",
  "preflight_counts": {
    "scanned": 120,
    "current": 75,
    "stale": 20,
    "pending": 20,
    "failed": 5,
    "skipped": 0
  },
  "requested": {
    "provider": "local",
    "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX",
    "device": "auto",
    "dimensions": 1024
  }
}
```

### Status Response

```json
{
  "job_id": "job_...",
  "status": "degraded",
  "progress": {
    "total": 120,
    "embedded": 113,
    "failed": 5,
    "skipped": 2,
    "stale": 0,
    "pending": 0
  },
  "events": [
    {
      "event_type": "fallback",
      "source_id": "mem_...",
      "message": "auto device fell back to cpu",
      "details": {
        "requested_device": "auto",
        "actual_device": "cpu"
      }
    }
  ]
}
```

Rules:
- Zero scan count fails unless `allow_empty=true`.
- Explicit device mismatch fails the job or item.
- Auto fallback is allowed only when recorded.
- Jobs with failed items complete as `degraded` once all non-failed eligible work is complete.
- `jobs retry --failed` retries only failed or stale eligible items and must not reprocess completed current items by default.
- Expensive job start, resume, cancel, and retry operations must include actor authorization and persisted audit events.
- Read-only job status and logs must remain non-mutating and machine-readable.

## Recall Explain

### Command

```bash
fulcrum memory recall "query" --explain --json
fulcrum action exec recall_knowledge --json '{"query":"query","explain":true}'
```

### Response Fragment

```json
{
  "results": [
    {
      "id": "mem_...",
      "type": "memory",
      "score": 0.92,
      "stage_ranks": {
        "fts": 2,
        "vector": 1,
        "graph": null,
        "reranker": 1
      },
      "stage_scores": {
        "fts": 0.71,
        "vector": 0.88,
        "graph": null,
        "reranker": 0.94,
        "fused": 0.92
      },
      "runtime": {
        "provider": "local",
        "model": "onnx-community/bge-reranker-v2-m3-ONNX",
        "requested_device": "auto",
        "actual_device": "cuda",
        "fallback_reason": null,
        "latency_ms": 34
      },
      "trust": {
        "provenance_class": "raw-backed",
        "confidence": 0.9,
        "freshness": 1,
        "supersession": "current"
      },
      "sources": [
        {
          "kind": "raw",
          "source_id": "src_...",
          "path": "raw/tool_trace/2026/04/22/src_....md"
        }
      ]
    }
  ]
}
```

Rules:
- Missing stage data must be `null` or omitted consistently.
- Code results must include path and line range.
- Provenance class must be one of `raw-backed`, `curated-backed`, `code-backed`, `legacy-unbacked`, or `generated`.

## RAG Health

### Command

```bash
fulcrum memory doctor --json
```

### Response Shape

```json
{
  "workspace_id": "ws_...",
  "project_id": "proj_...",
  "status": "degraded",
  "generated_at": "2026-04-22T00:00:00.000Z",
  "domains": {
    "l0": { "status": "healthy", "files": 10, "rows": 10 },
    "l1": { "status": "healthy", "files": 8, "rows": 8 },
    "fts": { "status": "healthy", "checked": 2, "failed": 0 },
    "code": { "status": "degraded", "files": 20, "chunks": 120, "orphan_chunks": 3 },
    "vectors": { "status": "degraded", "current": 70, "stale": 15, "failed": 2 },
    "graph": { "status": "degraded", "entities": 0, "edges": 0 }
  },
  "recommended_actions": [
    "Run code index rebuild to repair orphan chunks"
  ],
  "warnings": [],
  "errors": []
}
```

Rules:
- Health is read-only.
- Status must derive from domain checks.
- No manual SQL should be required to interpret output.

## Eval

### Command

```bash
fulcrum memory eval --suite rag-lifecycle --json
```

### Response Shape

```json
{
  "eval_run_id": "evalrun_...",
  "suite": "rag-lifecycle",
  "status": "failed",
  "results": {
    "retrieval_relevance": { "passed": 8, "failed": 1 },
    "ranking": { "passed": 5, "failed": 0 },
    "answer_correctness": { "passed": 4, "failed": 0 },
    "grounding_provenance": { "passed": 6, "failed": 1 },
    "graph_expansion": { "passed": 2, "failed": 0 },
    "operational_parity": { "passed": 7, "failed": 0 }
  },
  "failures": [
    {
      "case_id": "rag-provenance-001",
      "category": "grounding_provenance",
      "expected": "raw-backed",
      "actual": "legacy-unbacked"
    }
  ]
}
```

Rules:
- Default suite must be local and deterministic.
- Opt-in model or accelerator evals must be clearly marked and skipped by default.
- CI must require the default golden RAG eval gate only for changes touching RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures.
- Unrelated non-RAG changes may skip this gate, while local manual eval execution remains available.
- Expensive eval execution must include actor authorization and a persisted audit event.
