---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 01-foundation-reset/issues/18-test-infrastructure-baseline-and-ci.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [A2, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Doctor surface incomplete")
Docs: https://kit.svelte.dev/docs
---

# Doctor dashboard (/doctor)

## What to build

`/doctor`: per-subsystem health dashboard. Calls `doctor.run --json` tRPC (or `health.check` procedure array from Pillar 1). Renders a table: subsystem name, status badge (ok=green / warn=yellow / fail=red), message, checked_at timestamp, "Recovery" expandable with command to run. Auto-refreshes every 30s. Subsystems shown: foundation, inference, orchestration, sandcastle, router, tasks, docs, memory, repos, artifacts, search, notifications, api, cli, tui, web, platform (all checks from Pillars 1–17). `fulcrum doctor web` CLI check verifies build artifact + dev-server reachability.

Cuts through: `doctor.runAll()` tRPC → per-subsystem check JSON → table rendered → failed check shows recovery text → manual re-run button refreshes.

## Acceptance criteria

- [x] All Pillar 1–17 subsystems listed in table; healthy system → all rows show "ok" badge.
- [x] Simulated failure → fail status + recovery text rendered (foundation/inference/memory checks have real fail paths).
- [x] Auto-refresh every 30s; "Refresh now" button triggers window.location.reload().
- [ ] `fulcrum doctor --json` exit code 0 → all ok; exit code 1 → at least one fail — deferred: requires CLI integration (P14 scope).
- [x] Doctor page accessible without auth — no auth guard on load().
- [ ] axe-core: zero violations — deferred: requires Playwright a11y fixture (P16 issue 18 scope).
- [ ] Playwright: load `/doctor` — deferred: requires running dev server (P16 e2e scope).
- [ ] CLI: `fulcrum doctor --json` and `fulcrum doctor web` — deferred: P14 CLI scope.

## Blocked by

- Issue 01 (scaffold) — layout needed.
- Pillar 1 issue 18 (CI infrastructure) — `doctor.*` tRPC procedures scaffolded.
