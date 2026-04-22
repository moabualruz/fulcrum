# RAG Lifecycle Eval Suite

Deterministic local eval fixtures and runner for RAG lifecycle checks.

Default command:

```bash
pnpm --filter fulcrum-memory eval:rag-lifecycle
```

CLI command:

```bash
fulcrum memory eval --suite rag-lifecycle --json
```

Default cases are local and deterministic. They derive observations from the
checked-in fixture corpus in `fixtures.ts`; they do not call model providers,
download embeddings, or require GPU/accelerator access.

Opt-in heavy checks:

- `FULCRUM_RAG_EVAL_MODEL_HEAVY=1` or `--include-model-heavy` runs cases marked
  with `requires: ['model']`.
- `FULCRUM_RAG_EVAL_ACCELERATOR_HEAVY=1` or `--include-accelerator-heavy` runs
  cases marked with `requires: ['accelerator']`.

CI gate behavior:

- `.github/workflows/memory-eval.yml` runs the default suite only when a pull
  request touches RAG lifecycle, memory retrieval, code search, embedding, graph,
  eval fixture, core schema/type, or RAG CLI paths.
- Unrelated non-RAG changes skip this gate.
