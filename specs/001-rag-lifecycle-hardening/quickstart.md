# Quickstart: Fulcrum RAG Lifecycle Hardening

This quickstart describes how an operator or implementer should verify the feature when implementation exists.

## Prerequisites

- Run from repo root.
- Use a workspace with vault files and project files.
- Keep embedding/model-heavy checks opt-in unless explicitly testing embeddings.

## 1. Plan Rebuild Scope

```bash
fulcrum memory rebuild --all --mode plan --json
```

Expected:
- No state mutation.
- Output includes exact workspace/project scope.
- Output includes planned domains and preflight counts.

## 2. Dry Run

```bash
fulcrum memory rebuild --all --mode dry-run --json
```

Expected:
- No state mutation.
- Output includes rows that would be cleared or rebuilt.
- Unexpected zero scope fails unless allow-empty is set.

## 3. Execute Rebuild

```bash
fulcrum memory rebuild --all --execute --json
```

Expected:
- Derived state is rebuilt from canonical sources in staged or quarantined candidate state.
- Candidate state is promoted to served search state only after all required parity checks pass.
- Candidate promotion revalidates the canonical-source snapshot captured at rebuild start.
- Report includes parity checks for L0, L1, FTS, code files/chunks, vectors, and graph.
- Failed parity check exits non-zero, reports failed domain, and leaves previously served derived state unchanged.
- Source changes before promotion fail promotion, report stale snapshot details, and leave previously served derived state unchanged.

## 4. Start Embedding Job

```bash
fulcrum memory embed --scope memories --json
```

Expected:
- Output returns job ID and preflight counts.
- Job records requested provider, model, device, and dimensions.
- Job can resume after interruption.
- Jobs with failed items finish as degraded rather than staying running indefinitely.

## 5. Inspect Job

```bash
fulcrum jobs status job_... --json
```

Expected:
- Output includes item counts by status.
- Failed rows include error type/message.
- Auto fallback includes requested and actual device.
- Failed-item retry targets failed or stale eligible rows only and does not reprocess completed current rows by default.

## 6. Explain Recall

```bash
fulcrum memory recall "why did rebuild fail" --explain --json
```

Expected:
- Each result includes retrieval stages.
- Memory results include provenance class and source references.
- Code results include path and line range.

## 7. Check Health

```bash
fulcrum memory doctor --json
```

Expected:
- Output reports raw, L1, FTS, code, vector, failed embedding, stale embedding, and graph coverage.
- Output includes recommended actions.
- No manual SQL is needed.

## 8. Run Default Eval

```bash
fulcrum memory eval --suite rag-lifecycle --json
```

Expected:
- Default eval runs locally and deterministically.
- Failures are grouped by retrieval relevance, ranking, answer correctness, grounding/provenance, graph expansion, or operational parity.
- CI requires this default gate only for changes touching RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures.
- Unrelated non-RAG changes may skip the gate.

## Verification Commands During Development

```bash
pnpm --filter fulcrum-agent-core test
pnpm --filter fulcrum-memory test
pnpm --filter fulcrum-agent-cli test
pnpm test
pnpm build
pnpm run check:cycles
```
