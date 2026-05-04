# Test Coverage — Master Plan

## Goal

Close all 94 test gaps documented in `docs/TEST-GAPS.md`. Every gap becomes
a concrete test file. No gap stays as "should test this" — each becomes a
passing automated test.

## Existing Infrastructure

| Tool | Config | Command |
|------|--------|---------|
| Bun test | `bunfig.toml` | `bun test <path>` |
| Vitest (web) | `src/web/vitest.config.ts` | `cd src/web && bun run web:test` |
| Playwright (web e2e) | `src/web/playwright.config.ts` | `cd src/web && bun run web:e2e` |
| Playwright (a11y) | same config, `--project=chromium` | `cd src/web && bun run web:a11y` |
| PGlite | `src/product-kernel/db/pglite.ts` | In-process, no external DB needed |
| Test utils | `src/test-utils/db.ts` | `createTestDb()`, `createLocalOrg()` |

Playwright auto-starts `vite dev` with isolated `FULCRUM_HOME` per run.
PGlite provides an in-process Postgres for integration tests — no Docker needed.

## Phases

### Phase 1: Infrastructure (P1) — 6 issues

CI-blocking tests that prevent regression of bugs found today. Highest priority
because they gate every other phase.

- P1-01: Migration compatibility test
- P1-02: Dev server smoke test
- P1-03: SvelteKit export validation
- P1-04: Auth mode test (dev bypass vs FULCRUM_REQUIRE_AUTH)
- P1-05: Default org auto-seeding test
- P1-06: Feature flag gating consistency

### Phase 2: API/tRPC Integration (P2) — 15 issues

Real-DB integration tests for tRPC routers using PGlite. These verify that
the server-side logic works end-to-end without mocks.

- P2-01: artifacts router
- P2-02: documents router
- P2-03: memories router
- P2-04: orchestration router
- P2-05: runs router
- P2-06: search router
- P2-07: REST API v1 with auth
- P2-08: sprints.close dispositions
- P2-09: sprints.close event integrity
- P2-10: hybrid search params correctness
- P2-11: docs.tree recursive CTE
- P2-12: docs.move fractional sort
- P2-13: docs.create template application
- P2-14: webhook retry timing
- P2-15: product-kernel PGlite in web context

### Phase 3: Web Routes Playwright (P3) — 38 issues

Playwright e2e tests for every web route. Each test navigates to the route,
verifies it renders, interacts with primary controls, and checks data flow.

Grouped by area:
- P3-01..P3-06: Core routes (doctor, inbox, audit, agents, orchestration, inference)
- P3-07..P3-14: Content routes (memory, docs, projects, boards, runs)
- P3-15..P3-28: Settings routes (all /settings/* pages)
- P3-29..P3-38: Auth, invite, connectors, importers, billing, API, skills

### Phase 4: TUI Integration (P4) — 4 issues

FakeTTY-based integration tests for TUI screens.

- P4-01: Screen render smoke (all screens)
- P4-02: Keyboard navigation round-trip
- P4-03: Bulk operations + selection lifecycle
- P4-04: Feature flag screen gating

### Phase 5: Inference Sidecar (P5) — 4 issues

Integration tests for the inference sidecar lifecycle.

- P5-01: Sidecar start/stop lifecycle
- P5-02: Model pull progress streaming
- P5-03: Backend switching
- P5-04: Feature flag gate on OpenAI-compatible

### Phase 6: CLI Integration (P6) — 14 issues

End-to-end CLI command tests using real `bun run src/index.ts`.

- P6-01..P6-14: One issue per CLI command gap

### Phase 7: Cross-Surface E2E (P7) — 14 issues

Full-stack user journeys spanning CLI → web → tRPC → PGlite.

- P7-01..P7-14: One issue per user journey

### Phase 8: Gate Review Regressions (P8) — 13 issues

Regression tests for every bug found by gate reviewers.

- P8-01..P8-13: One test per gate finding

## Dependency Graph

```
P1 (infrastructure) ← blocks everything
  ↓
P2 (tRPC integration) ← P3 depends on working server-side
  ↓
P3 (Playwright) + P4 (TUI) + P5 (inference) + P6 (CLI) ← parallel
  ↓
P7 (cross-surface) ← needs all surfaces working
  ↓
P8 (gate regressions) ← can run parallel with P7
```

## Issue Count

| Phase | Issues | Priority |
|-------|--------|----------|
| P1 Infrastructure | 6 | critical |
| P2 tRPC Integration | 15 | high |
| P3 Playwright | 38 | high |
| P4 TUI | 4 | medium |
| P5 Inference | 4 | medium |
| P6 CLI | 14 | medium |
| P7 Cross-Surface | 14 | low (complex) |
| P8 Gate Regressions | 13 | high |
| **Total** | **108** | |

## Acceptance Criteria

- [ ] All 108 issues `Status: completed`
- [ ] `bun run ci` test stage: 0 new failures from test-coverage branch
- [ ] Every Playwright test: page loads, primary interaction works, no console errors
- [ ] Every PGlite integration test: real queries, real migrations, no mocks of DB layer
- [ ] `docs/TEST-GAPS.md` updated: all `[ ]` → `[x]` with test file paths
