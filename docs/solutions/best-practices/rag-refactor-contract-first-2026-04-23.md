---
title: Contract-first refactors for guarded RAG modules
date: 2026-04-23
category: docs/solutions/best-practices
module: Fulcrum RAG dual-rail retrieval and repair
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - splitting a large module into support or contract files
  - a package is guarded by cycle checks and surface inventory ledgers
tags: [rag, refactor, import-cycles, inventory-ledger, contracts]
---

# Contract-first refactors for guarded RAG modules

## Context
The dual-rail RAG upgrade decomposed several large modules into support files. The first pass preserved behavior and passed targeted package tests, but the repo-wide close-out surfaced two structural failures:

- `pnpm run check:cycles` caught new import cycles between main modules and their extracted support files.
- `pnpm test` failed `scripts/surface-inventory.test.ts` because new files, exports, and MCP surfaces were not reflected in the unit acceptance ledger.

## Guidance
When splitting a large guarded module, extract the shared contract first, then move helpers.

1. Move shared request/response/types into a dedicated contract file or an existing neutral types file.
2. Make the main module and its helper/support modules both depend on that contract.
3. Keep support modules free of imports back into the main module, even type-only imports.
4. After adding new source files or public surfaces, update the inventory guard inputs and the unit ledger in the same change.

For this repo, the concrete pattern was:

- `packages/cli/src/tool-registry-types.ts` for shared CLI registry contracts
- `packages/memory/src/eval/roadmap-types.ts` for roadmap eval shared types
- `packages/memory/src/retrieval/search-code-contract.ts`
- `packages/memory/src/retrieval/search-context-contract.ts`
- `packages/memory/src/setup/rag-types.ts` reused for RAG health shared types

## Why This Matters
Targeted tests alone are not enough in this codebase. Fulcrum also enforces:

- no package import cycles
- explicit unit-ledger coverage for newly introduced repo surfaces
- stable MCP and tool-registry inventories

If refactors move logic without moving the shared contracts, helper extraction can silently introduce cycles. If new files or MCP tools land without ledger updates, the full-pass inventory guard correctly fails late in the close-out.

## When to Apply
- Any refactor that creates `*-support.ts`, `*-contract.ts`, or similar helper modules
- Any change that adds public exports, CLI registry entries, MCP tools, or new source files under `packages/*/src`
- Any feature branch that only ran targeted package tests and still needs repo-wide close-out

## Examples
Before:

```ts
// search-code-support.ts
import type { SearchCodeInput, SearchCodeResultRow } from './search-code.js'
```

This created `search-code.ts -> search-code-support.ts -> search-code.ts`.

After:

```ts
// search-code-contract.ts
export interface SearchCodeInput { /* ... */ }
export interface SearchCodeResultRow { /* ... */ }

// search-code.ts
import type { SearchCodeInput, SearchCodeResultRow } from './search-code-contract.js'

// search-code-support.ts
import type { SearchCodeInput, SearchCodeResultRow } from './search-code-contract.js'
```

For inventory closure, treat new contract/support files as first-class rows in:

- `docs/reference/2026-04-21-sixth-pass-unit-acceptance-ledger.json`
- `docs/reference/2026-04-21-sixth-pass-granular-surface-ledger.md`
- `scripts/surface-inventory.test.ts`

## Related
- [2026-04-23 dual-rail architecture plan](/home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-23-001-feat-rag-dual-rail-architecture-plan.md)
- [sixth-pass granular surface ledger](/home/mkh/workspace/pi-stack-plan/docs/reference/2026-04-21-sixth-pass-granular-surface-ledger.md)
