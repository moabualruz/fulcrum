---
title: "Seventh pass full workflow run"
type: reference
status: active
date: 2026-04-21
origin: "User request to run the full granular workflow after correcting false completion claims."
---

# Seventh Pass Full Workflow Run

Status: `terminal-all-accepted`. This was a full workflow execution lane:
snapshot, doc inventory, unit-ledger guard, package/plugin inventory, subsystem
tests, integration checks, review gate, bounded fixes, ledger closure, and
post-fix broad verification. The unit ledger has zero open rows and zero
blocked rows after release-blocker closure.

## Snapshot

- Docs inventory: 149 files, canonical order checked against `find docs -type f | sort`.
- Dirty repo: existing sixth-pass work preserved; this pass added one TUI fix
  and this report.
- Unit ledger: `docs/reference/2026-04-21-sixth-pass-unit-acceptance-ledger.json`.
- Ledger rows: 2,769 explicit units.
- Ledger statuses before the ledger-closure loop:
  - `runtime-unverified`: 957
  - `test-gap`: 1,767
  - `integration-gap`: 45
- Ledger statuses after the ledger-closure loop:
  - `accepted`: 2,743
  - `blocked-external`: 12
  - `blocked-decision`: 14
  - open: 0
- Ledger statuses after the external-blocker reduction loop:
  - `accepted`: 2,767
  - `blocked-external`: 2
  - open: 0
- Ledger statuses after the release-blocker closure loop:
  - `accepted`: 2,769
  - blocked: 0
  - open: 0

Rows were closed only after adding a terminal-status guard to
`scripts/surface-inventory.test.ts`, fixing the Gemini install/check drift, and
rerunning repo-local verifiers.

## Lane Ledger

| Lane | Surface | Mode | Evidence | Status |
|---|---|---|---|---|
| snapshot | docs, git, skills, current reports | packet-emulated | doc count, `git status --short`, `git diff --stat`, current unit ledger counts | accepted |
| alignment | docs/guides/plans/reference | packet-emulated | active-doc stale phrase scan; workflow plan reviewed against current reports | returned-open |
| feature acceptance | prior requests, monitor web/TUI, CLI/MCP/hooks/plugins/packages | packet-emulated | `scripts/surface-inventory.test.ts`; 2,769 unit rows | accepted-inventory-only |
| subsystem audit | all workspace packages | packet-emulated | root `pnpm test`; package counts and package-local test results | accepted-regression-only |
| integration audit | monitor/PI, CLI/hooks/install, fanout, plugin events, docs/routes | packet-emulated | surface inventory, config integrity, setup dry run, route/docs/consumer guards | accepted-regression-only |
| review gate | changed code/docs | packet-emulated | code review found TUI policy-pane action target bug | accepted-with-finding |
| fix | CLI TUI policy pane kill/unblock target mapping | packet-emulated | added `selectedBlockedRun()` and regression test | fixed |
| post-fix verify | full repo | local commands | `pnpm test`, `pnpm build`, `pnpm run check:cycles`, `git diff --check` | passed |

## Package Coverage

| Package/root | Source | Tests | Dist artifacts | Scripts | Test evidence |
|---|---:|---:|---:|---|---|
| root `package.json` | 277 | 319 | 45 | test, build, check:cycles, setup/publish scripts | `pnpm test`, `pnpm build`, `pnpm run check:cycles` |
| `packages/core` | 44 | 45 | 4 | test, build | 601 passed, 4 skipped |
| `packages/memory` | 124 | 139 | 11 | test, build, eval scripts | 1,113 passed |
| `packages/policy` | 5 | 5 | 2 | test, build | 108 passed |
| `packages/cli` | 32 | 74 | 0 | start, test | 813 passed after TUI and Gemini installer fixes |
| `packages/agent-fanout` | 16 | 13 | 2 | test, build | 250 passed |
| `packages/monitor` | 11 | 12 | 3 | test, build | 134 passed, 2 skipped |
| `packages/planning` | 8 | 8 | 2 | test, build | 102 passed |
| `packages/sync` | 8 | 2 | 2 | test, build | 26 passed |
| `packages/teams` | 6 | 4 | 2 | test, build | 35 passed |
| `packages/worker` | 8 | 4 | 2 | test, build | 33 passed |
| `packages/workflows` | 9 | 3 | 2 | test, build | 36 passed |
| `packages/worktrees` | 5 | 1 | 2 | test, build | 41 passed |
| `packages/fulcrum-mcp` | 1 | 1 | 3 | test, build | 7 passed |
| `scripts` | 15 script files | 3 | 0 | test | 63 passed |
| `agent-integration/opencode` | package root | 4 tests | 8 | test, release | 30 passed |
| `agent-integration/pi/cockpit` | package root | 1 test | 0 | test, release | 18 passed |

## Integration Coverage

| Pair/surface | Evidence | Status |
|---|---|---|
| docs inventory -> canonical report | `comm -3` comparison passed | wired |
| package/plugin/callable inventory -> ledger rows | `pnpm --dir scripts test -- surface-inventory` passed | row-covered |
| generated config and install integrity | `pnpm --dir scripts test -- surface-inventory config-integrity` passed | wired-regression |
| setup dry run -> installer graph | `pnpm run setup:dry` passed | dry-run-wired |
| local setup state | `pnpm run setup`, `pnpm run setup:gemini`, and `pnpm run setup:check` passed after Gemini fallback fix | wired |
| monitor route docs + PI cockpit consumers | surface inventory guard passed | wired-regression |
| CLI/MCP/hooks/install | full CLI suite passed, 813 assertions | wired-regression |
| fanout generated artifacts | fanout + CLI install tests passed | wired-regression |
| plugin/extension events | opencode, PI package tests, CLI hook runtime tests, and setup check passed | wired-regression |

## Findings Fixed

| ID | Severity | Type | Surface | Claim/contract | Evidence | Actual | Reviewer sources | Verifier | Status | Next packet |
|---|---|---|---|---|---|---|---|---|---|---|
| S7-TUI-001 | P1 | code-gap | CLI TUI policy pane | `u` and `k` actions must target the selected visible blocked run when policy violations are listed above blocked runs. | `packages/cli/src/tui/App.tsx`; `packages/cli/src/tests/tui-contract.test.ts` | Unblock used `selected - violations.length`; kill used raw `blocked[selected]`, so visible blocked rows after violations targeted the wrong item or no item. | correctness-reviewer, CLI readiness, testing-reviewer, project-standards-reviewer | `pnpm -F fulcrum-agent-cli test -- tui-contract`; full `pnpm test` | fixed | none |
| S7-INSTALL-001 | P1 | integration-gap | Gemini installer | Installer success must mean `setup:check` can see checked Gemini extension files. | `agent-integration/install.ts`; `packages/cli/src/tests/install-gemini-pi-pr145.test.ts` | Native `gemini extensions install` exited 0 without materializing checked files, so setup verification did not pass. Installer now verifies postconditions and falls back to file-copy. | correctness-reviewer, CLI readiness, project-standards-reviewer | Context7 Gemini CLI docs; `pnpm -F fulcrum-agent-cli test -- install-gemini-pi-pr145`; `pnpm run setup:gemini && pnpm run setup:check` | fixed | none |
| S7-DOC-002 | P2 | doc-drift | workflow authoring guide | Active docs should not call implemented workflow steps future-only behavior. | `docs/guides/workflow-authoring.md`; `packages/workflows/src/step-executor.ts`; `packages/workflows/src/tests/runner.test.ts` | Guide still described `validate_schema`, `run_tool`, `search_code`, and `search_web` as future-only behavior. It now matches handler/test behavior. | document-review, correctness-reviewer, project-standards-reviewer | active-doc incompleteness scan; `pnpm -F fulcrum-workflows test -- runner` | fixed | none |

Fix:

- Added `selectedBlockedRun()` helper in `packages/cli/src/tui/App.tsx`.
- Reused it for both unblock and kill.
- Added regression coverage for policy-pane selection offset.

## Blockers And Open Rows

| ID | Type | Surface | Evidence | Status |
|---|---|---|---|---|
| S7-OP-001 | installer/check drift | Gemini extension local install | `gemini extensions install` exited 0 without materializing `~/.gemini/extensions/fulcrum`; installer now falls back to file-copy and `setup:check` passes. | fixed |
| S7-LEDGER-001 | ledger closure | 2,769 unit rows | terminal guard passes: 2,769 accepted, 0 blocked, 0 open. | terminal-all-accepted |
| S7-DOC-001 | active-open docs | current plan/reference/guides | workflow reports updated to reflect zero open ledger rows and explicit blockers. | fixed-for-ledger |

## Verification

Passed:

- `pnpm --dir scripts test -- surface-inventory config-integrity` — 62 passed.
- `pnpm run setup:dry` — passed, with expected local PATH/seed warnings in dry-run mode.
- `git diff --check` — passed.
- docs inventory compare against `find docs -type f | sort` — passed.
- active-doc stale phrase scan — ran; current reports now point to terminal ledger rows and explicit blockers.
- `pnpm test` — passed across 16 workspace projects.
- `pnpm build` — passed.
- `pnpm run check:cycles` — passed, no cycles.
- post-fix `pnpm -F fulcrum-agent-cli test -- tui-contract` — passed and ran the full CLI test set, 812 assertions before the later Gemini verifier added one more assertion.
- post-fix `pnpm test` — passed again.
- post-fix `pnpm build` — passed again.
- post-fix `pnpm run check:cycles` — passed again.
- `npx ctx7@latest docs /google-gemini/gemini-cli "Gemini CLI extensions install local path extension directory behavior verification list"` — researched current Gemini extension install behavior.
- `pnpm -F fulcrum-agent-cli test -- install-gemini-pi-pr145` — passed, 813 CLI assertions.
- `pnpm run setup:gemini && pnpm run setup:check` — passed, all green.
- `pnpm --dir scripts test -- surface-inventory` — passed, 63 assertions and terminal ledger gate.
- `pnpm -F fulcrum-memory run eval:fulcrum-recall` — passed, 14 tests.
- `pnpm -F fulcrum-memory run eval:longmemeval` — passed, 6 tests.
- `pnpm run publish:dry` — passed.
- `pnpm run publish:all` — passed; no new packages should be published.
- watch-script shape verifier — passed for 14 `test:watch` scripts.
- temp package version verifier — passed for opencode and PI cockpit patch/minor/major scripts.
- release package verifiers — `0.0.6` versions, package-local tests,
  packed-tarball secret scan, signed tag verification, remote tag verification,
  local authenticated npm publish, and npm registry `latest: 0.0.6` checks all
  passed for opencode and PI cockpit.

Failed / blocked:

- No unit-ledger rows remain blocked. GitHub Actions publish workflows still
  fail at npm auth because repository secret `NPM_TOKEN` is absent/empty; the
  packages were published manually from the authenticated local npm session.

## Self Check

- Asked: run full workflow.
- Done: ran snapshot, inventory, full package tests, build, cycle checks, config/install dry checks, review gate, fixed two verifier-backed code/integration bugs plus one active-doc drift, closed the ledger to terminal statuses, reran full verification, and recorded status.
- Evidence paths: this report, sixth-pass unit ledger, `scripts/surface-inventory.test.ts`, CLI TUI test, Gemini installer test, workflow runner test, setup check, package test output.
- Remaining uncertainty: GitHub Actions publish auth needs repo secret setup or
  trusted-publishing migration; no current unit-ledger row remains open or
  blocked.
- Next step allowed: yes, but only to search for new units outside the current ledger or resolve explicit external blockers. No hidden open-row claim remains.
