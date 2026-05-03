---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [09-web-search-page.md, 10-cmdk-palette-web.md, 12-cli-commands.md, 13-tui-search-and-palette.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Performance benchmarks + Playwright e2e + three-surface parity acceptance tests

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Acceptance criteria section)

## What to build
Final acceptance and performance validation slice. Implements: `hyperfine` benchmark harness for `search.query` p95 at 10k rows (<200ms gate); cmd+K first paint <50ms measurement; suggest <100ms; Orama failover test; cross-surface parity integration tests (entity created via CLI → searchable via Web and TUI without restart); Playwright e2e full flow (query, facet, saved search, cmd+K, cmdk dispatch). Also verifies all 8 kinds appear in `/search` from a single test-data seed.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: N/A (tests only).
- [ ] Web surface: Playwright: seed 1 entity per kind (8 total) via CLI → all 8 visible at `/search?q=<common-term>`; `⌘K` opens <50ms; facet `kind=doc` narrows to 1; saved search create/load round-trip; `>create-task` modal dispatches and creates task.
- [ ] CLI command: `fulcrum search "common-term" --json` returns ≥8 results (all 8 kinds); `--kind task` returns 1; performance: `hyperfine --warmup 3 'fulcrum search "foo" --json'` p95 <200ms at 10k rows.
- [ ] TUI screen: TUI smoke test: cross-kind results visible; `S` full-screen opens; `⌘K` overlay opens; in-panel bar filters tasks panel.
- [ ] Tests: performance benchmark (hyperfine) added to `bun run ci` as optional gate (warn not fail if environment slow); Playwright e2e suite green; cross-surface parity: CLI create → Web visible → TUI visible; ranking unit test: open task > closed task (formula verified); suggest <100ms at 1k titles; RED→GREEN.

## Blocked by
- `09-web-search-page.md`, `10-cmdk-palette-web.md` — Web surfaces.
- `12-cli-commands.md` — CLI.
- `13-tui-search-and-palette.md` — TUI.

## Notes / Tech-stack hints
- Seed script: `scripts/seed-search-test-data.ts` creates 1 entity per kind in a test org; callable from test setup.
- Orama failover test: mock PGlite query to throw → Orama in-memory index serves results.
- Three-surface parity: same test pattern as Pillar 10 (seed via CLI, verify via Playwright + TUI harness).
- `bun run ci` gate: add `search:bench` stage that runs hyperfine and outputs JSON; parser asserts p95 <200ms.
