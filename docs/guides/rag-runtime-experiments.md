# RAG Runtime Experiments

Runtime experiments are the optional path for testing alternate vector stores,
graph stores, code indexers, and model runtimes against Fulcrum's local RAG
baseline.

Two built-in challenger lane identities currently ship under one shared contract:

| Lane | Role under common contract |
| --- | --- |
| `python-ml` | Python challenger for model-heavy retrieval stages such as semantic candidate generation and rerank |
| `rust-search` | Rust challenger for search/index stages such as candidate generation and fusion-side index work |

Both lanes stay disabled by default. They are challenger implementations of the
same planner, explain, and eval contract the baseline uses. They are not a
separate retrieval product.

They are disabled by default. A missing optional adapter is reported as
`status: disabled` with `scope: out_of_scope` and `local_baseline_impact: none`.
This means the local SQLite, vault, vector, graph, task, run, memory, and policy
surfaces remain authoritative until an operator explicitly adopts a candidate.

## Adapter Boundary

Runtime adapters are integration boundaries only. They can provide these
capabilities:

| Adapter kind | Allowed responsibility |
| --- | --- |
| `vector_store` | Upsert, query, and optionally delete vector records for scoped RAG data |
| `graph_store` | Upsert graph entities/edges and expand scoped graph neighborhoods |
| `code_indexer` | Index project code into code chunks and report failures |
| `model_runtime` | Embed text and optionally rerank candidate results |

Adapters must not own canonical Fulcrum state. They must not create tasks, start
or complete agent runs, enforce policy, or write memory directly. Those remain in
`@fulcrum/core`, `@fulcrum/policy`, and `@fulcrum/memory` domain paths.

Every adapter descriptor and experiment report is sanitized before persistence or
output. Secret-like values are redacted, and absolute path-like values are replaced
with `REDACTED_PATH` fingerprints rather than raw paths.

## Experiment Lifecycle

Runtime experiment records live in `runtime_experiments`, scoped by
`workspace_id` and `project_id`. Reads, writes, reports, adoption, and rollback
all require that same scope.

Allowed statuses:

| Status | Meaning |
| --- | --- |
| `disabled` | Default state. Candidate is optional or unavailable and has no baseline impact |
| `planned` | Candidate has been recorded for evaluation |
| `running` | Candidate evaluation is in progress |
| `completed` | Comparison data exists and adoption gates can be reviewed |
| `failed` | Evaluation failed before a usable comparison |
| `adopted` | Candidate passed all adoption gates and was accepted |
| `rejected` | Candidate failed at least one adoption gate |
| `rolled_back` | Adopted candidate was reverted to the local baseline |

Do not add `out_of_scope` to the persisted status enum. `out_of_scope` is an
availability/reporting scope for optional paths, not a runtime experiment status.

## Baseline Comparison

The comparison step uses two scoped eval run IDs:

- `baseline_eval_run_id`: current local baseline eval
- `candidate_eval_run_id`: candidate runtime eval

The comparison summarizes pass rate, failed/skipped/error counts, average latency,
p95 latency, and optional resource summaries. It produces two gates:

| Gate | Pass condition |
| --- | --- |
| `quality` | Candidate pass rate meets or exceeds the configured baseline threshold and does not introduce extra errors |
| `latency` | Candidate average latency stays within the configured regression ratio |

Resource summaries are informational. Numeric fields are diffed where possible,
but adoption is still controlled by the explicit gates below.

## Adoption Gates

Adopting a candidate requires all six gates to pass:

| Gate | Required evidence |
| --- | --- |
| `quality` | Baseline-vs-candidate comparison quality gate is `passed` |
| `latency` | Baseline-vs-candidate latency gate is `passed` |
| `rollback` | Persisted rollback plan or rollback command exists and the gate is `passed` |
| `local_first` | Candidate does not require a remote service for default operation |
| `agent_tool_parity` | Agent and tool surfaces keep parity; `missing_tools` is empty |
| `operational_risk` | Risk is accepted as low enough; `high` and `critical` do not pass |

If any gate is missing or failed, adoption is blocked and the experiment is marked
`rejected`. This is deliberate: no optional runtime becomes default through a
partial comparison.

## CLI

List experiments:

```bash
fulcrum memory runtime-experiments list --workspace-id ws_1 --project-id proj_1 --json
```

Report one experiment:

```bash
fulcrum memory runtime-experiments report runtimeexp_... --workspace-id ws_1 --project-id proj_1 --json
```

Adopt a candidate after all gates pass:

```bash
fulcrum memory runtime-experiments adopt runtimeexp_... --workspace-id ws_1 --project-id proj_1 --json
```

Rollback an adopted candidate:

```bash
fulcrum memory runtime-experiments rollback runtimeexp_... --workspace-id ws_1 --project-id proj_1 --json
```

JSON output is redacted. Reports include availability, adoption gate evaluation,
lane identity, shared lane-contract metadata, and next actions. Disabled optional
candidates should be treated as informational, not as local baseline failures.

## MCP / Action Surface

The same contract is exposed through MCP tools:

- `list_runtime_experiments`
- `get_runtime_experiment_report`
- `adopt_runtime_experiment`
- `rollback_runtime_experiment`

Read tools stay read-only. Adoption and rollback tools are explicit writes.
