# Quickstart: Fulcrum RAG Roadmap Delivery

**Feature**: [Fulcrum RAG Roadmap Delivery](./spec.md)
**Audience**: implementers and reviewers

## Preconditions

- Work from repo root: `/home/mkh/workspace/pi-stack-plan`.
- Use a non-install profile for development and review unless explicitly validating installed/operator data.
- Do not run clean-slate rebuilds unless the task explicitly scopes them.
- Keep model-heavy and accelerator-heavy evals opt-in.

## Baseline Inspection

```bash
./fulcrum memory doctor --profile dev --json
./fulcrum memory rebuild --all --mode plan --profile dev --json
./fulcrum memory rebuild --all --mode dry-run --profile dev --json
```

Expected:
- Commands are read-only.
- Output includes profile/path fingerprints.
- Degraded domains include next actions.
- Required domains do not report healthy when coverage is stale, failed, empty, or missing expected eval cases.

## Targeted Repair Flow

```bash
./fulcrum memory doctor --repair-plan --profile dev --json
./fulcrum memory rebuild --all --execute --profile dev --json
./fulcrum memory doctor --profile dev --json
```

Expected:
- Repair plan lists exact mutation scope.
- Normal repair fixes derived-state differences from canonical sources.
- Clean-slate rebuild is absent unless explicitly requested.
- Final health is `healthy`, or every degraded/failed/out-of-scope required domain has a reason and retry action.

## Embedding Job Flow

```bash
./fulcrum memory embed --scope memories --json
./fulcrum memory embed --scope l1-pages --json
./fulcrum memory embed --scope code --json
./fulcrum jobs status <job_id> --json
./fulcrum jobs resume <job_id> --json
./fulcrum jobs retry <job_id> --failed --json
```

Expected:
- Code scope uses the code embedder path.
- Output distinguishes requested and actual provider/model/device/dimensions.
- Explicit unavailable device fails closed.
- Automatic fallback is visible when allowed.
- Embedded counts match verified vector rows plus vector metadata.

## Unified Search Flow

```bash
./fulcrum action exec search_context --json '{"query":"how is RAG repair connected to code vector coverage?","limit":10,"explain":true}'
./fulcrum action exec search_code --json '{"text":"code vector coverage","limit":5}'
```

Expected:
- `search_context` returns typed memory, code, file, graph, task, and decision evidence when present.
- Each result has provenance class, source reference, freshness, and explanation status.
- Code results include line ranges, symbol context, parse/index state, vector state, and stage contributions.
- If a stage is unavailable, skipped, stale, degraded, or disabled, explain output says so.

## Eval Flow

```bash
./fulcrum memory eval --suite rag-lifecycle --json
./fulcrum memory eval --suite live-rag --json
./fulcrum memory eval --suite code-rag --json
./fulcrum memory eval --suite unified-context --json
```

Expected:
- Fixture suites are deterministic.
- Live suite fails when vector or graph coverage is empty/stale/inconsistent.
- Required live domain with zero expected cases is degraded, not passing.
- Eval output includes thresholds before results and query trace references for failures.

## Trace Flow

```bash
./fulcrum action exec get_rag_query_trace --json '{"query_trace_id":"ragtrace_..."}'
```

Expected:
- Trace includes candidate counts, stage ranks/scores, fusion/rerank data, latency, runtime truth, freshness, provenance, source diversity decisions, and skipped-stage reasons.
- Agent-facing trace redacts absolute paths and secrets.

## Targeted Tests

```bash
pnpm --filter fulcrum-agent-core test
pnpm --filter fulcrum-memory test
pnpm --filter fulcrum-cli test
```

Minimum new test areas:
- Core enum checks and ID prefix checks.
- Repair plan and health status behavior.
- Vector metadata reconciliation.
- Code embedder and code vector retrieval.
- Unified context result contracts and diversity.
- Graph coverage and explain contribution.
- Live eval degraded readiness.
- Query trace persistence/redaction.
- CLI/MCP action parity.

## Broad Verification

```bash
pnpm test
pnpm build
pnpm run check:cycles
git diff --check
```

Expected:
- No import-cycle regressions.
- New TypeScript imports include `.js` for relative source imports.
- No generated reports or traces leak secrets, raw env values, or unintended absolute paths.
