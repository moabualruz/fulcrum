---
Status: ready-for-agent
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/06-rest-parity-search-notify-audit-runs.md, 13/issues/08-webhook-dispatcher-hmac-retry.md, 13/issues/12-confluence-notion-adapters.md, 13/issues/13-repo-supervision-connectors.md, 13/issues/14-csv-import-export.md, 13/issues/15-historical-imports-linear-jira-plane.md, 13/issues/16-doctor-integration.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [C4, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

End-to-end parity verification across all three surfaces for the full Pillar 13 domain set. For each domain group (tasks, docs, sprints, memories, runs, artifacts, repos, search, notify, audit, webhooks, connectors), verify: (a) Playwright e2e hits the web UI action; (b) `fulcrum <domain> <verb> --json` CLI integration test; (c) TUI in-process smoke call via `createCaller`. This is the integration test suite that seals Pillar 13's "done" criteria. Also includes `hyperfine` benchmarks: tRPC `tasks.list` p95 <50ms at 10k tasks; REST +10ms overhead; webhook dispatch p95 <1s under 100 concurrent deliveries; rate limiter stress test (200 req/60s → first 100 pass, 101–200 → 429).

- **Web**: Playwright test suite covers create/read/update/delete for each domain via web UI.
- **CLI**: CLI integration tests invoke `fulcrum <domain> <verb> --json` and assert typed JSON output.
- **TUI**: TUI smoke tests via `FakeTTY` driver assert each domain's tRPC procedure reachable in-process.

## Acceptance criteria

- [ ] Parity matrix: tasks/docs/sprints/memories/runs/artifacts/repos/search/notify/audit/webhooks/connectors — all 12 domains covered by Web Playwright + CLI integration + TUI smoke.
- [ ] `hyperfine`: tRPC `tasks.list` p95 <50ms at 10k tasks; REST wrapper overhead ≤10ms; webhook dispatch <1s for 100 concurrent deliveries.
- [ ] Rate limiter stress: 100 req in 60s pass; 101st → 429; clean window at 61s (verified by integration test, not hyperfine).
- [ ] `bun run ci` includes all parity tests; exits non-zero on any surface failure.
- [ ] `bun run type-check` exits 0 with full consolidated router.

## Blocked by

- 13/issues/06-rest-parity-search-notify-audit-runs.md
- 13/issues/08-webhook-dispatcher-hmac-retry.md
- 13/issues/12-confluence-notion-adapters.md
- 13/issues/13-repo-supervision-connectors.md
- 13/issues/14-csv-import-export.md
- 13/issues/15-historical-imports-linear-jira-plane.md
- 13/issues/16-doctor-integration.md

## Notes

P13.38–P13.40 maps to this slice. This is the pillar completion gate — only mark Pillar 13 done after this slice passes.
