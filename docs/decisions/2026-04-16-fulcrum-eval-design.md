---
date: 2026-04-16
kind: adr
status: accepted
gate: 4
plan: docs/plans/2026-04-16-memory-v2b-plan.md
finding: product-review F7 (LongMemEval is wrong-shape for code-change-memory; needs Fulcrum-specific eval)
---

# ADR — Gate 4: Fulcrum-Specific Recall Eval Design

## Context

v2b PR 14 originally targeted LongMemEval as the regression benchmark. Product review F7 found LongMemEval evaluates conversational-memory recall, which is the wrong shape for Fulcrum's code-change-memory access pattern.

Gate 4 requires a Fulcrum-specific eval design before PR 14 ships.

## Decision

Design eval per v2b plan §Phase 5 with corpus seeded from v2a's `memory_recall_events` ledger (the table created in v2a PR 1 Task 4) after v2a ships and produces real recall events.

Eval design:
- **Corpus source**: `memory_recall_events` rows from the user's own dogfood usage during the v2a bake (or post-v2a usage if `BAKE_MODE=skip`).
- **Per-eval-row**: `(query, expected_top_memory_ids[], scope, observed_top_memory_ids[], rank_quality_metrics)`.
- **Quality metrics**: nDCG@10 over expected-memory hits, MRR (mean reciprocal rank of first expected hit), recall@5, plus a per-`kind` slice (decisions, file_patches, task_outcomes separately).
- **Eval target file**: `packages/memory/src/eval/fulcrum-recall/`.
- **Build script**: `pnpm --filter fulcrum-memory eval:fulcrum-recall` — runs the harness against the current `recall_memory` implementation, emits a per-metric report.
- **CI integration**: regression job that fails the build if nDCG@10 drops by ≥3% from baseline; baseline pinned in `packages/memory/src/eval/fulcrum-recall/baseline.json`.

Where corpus is empty (zero recall events): emit a synthetic seed from the planning ADRs themselves — query: ADR title; expected hit: ADR body. This bootstraps the eval until real data accumulates.

## Consequences

- v2b PR 14 ships eval with synthetic seed corpus (no real events present at v2b PR 14 build time in `BAKE_MODE=skip`).
- The eval is structurally sound but semantically thin until 2 weeks of real recall_events accumulate.
- The user re-runs `pnpm eval:fulcrum-recall --update-baseline` after dogfood data exists.

## Override path

If the user produces a different eval design before v2b PR 14 begins, pre-write a replacement ADR. The executor honors the on-disk ADR.
