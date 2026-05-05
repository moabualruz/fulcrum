---
phase: "03"
plan: "05"
title: "Sandcastle providers, agent profile parity, artifacts, session resume"
subsystem: orchestration
tags: [symphony, sandcastle, providers, adapter-swap, session-resume, artifact-glob, tdd]
dependency_graph:
  requires: ["03-01", "03-04"]
  provides: [resolve-agent-run-config, adapter-swap-contract, sandcastle-provider-hardening, configured-artifact-glob, thread-resume-path, unsupported-capability-state, doctor-sandbox-checks]
  affects: [dispatch, sandbox-runner, session-resume, artifact-harvest, doctor-page]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, WORKFLOW.md-override-profile-default, explicit-capability-state, thread-resume-codex-path]
key_files:
  created:
    - src/agents/resolve-agent-run-config.ts
    - src/orchestration/sandbox-runner.test.ts
  modified:
    - src/orchestration/sandbox-runner.ts
    - src/orchestration/session-resume.ts
    - src/orchestration/__tests__/session-resume.test.ts
    - src/orchestration/artifact-harvest-hook.test.ts
    - src/web/src/routes/doctor/+page.server.ts
    - src/web/src/routes/doctor/page.server.test.ts
decisions:
  - "resolveAgentRunConfig merges WORKFLOW.md override fields over AgentProfile defaults; UnknownAgentError for unsupported agent names; Codex default"
  - "session-resume result exposes resumeVia (transcript-path | thread/resume | unsupported) and capability (supported | unsupported) — no silent no-op for unsupported profiles"
  - "Codex agentName routes to findPriorThreadId → thread/resume path (D-21); non-Codex uses transcript-path"
  - "sandbox-runner re-exports DEFAULT_ARTIFACT_GLOB for consumer/test access"
  - "doctor checkSandcastle() calls sandboxProviderDoctorChecks() — errors yield fail status naming the flag; runAll exported for CLI/test reuse"
  - "web:check SIGABRT is pre-existing svelte-check OOM crash; not introduced by this plan (documented in 03-01 through 03-04)"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-05T00:20:00Z"
  tasks_completed: 5
  files_modified: 6
  files_created: 2
---

# Phase 03 Plan 05: Sandcastle Providers, Agent Profile Parity, Artifacts, Session Resume Summary

**One-liner:** `resolveAgentRunConfig` merges WORKFLOW.md overrides over five-agent profiles, adapter-swap contract proven for claude-code/codex/opencode/gemini-cli/pi, doctor sandcastle checks report named provider errors (sandbox-docker, sandbox-podman, etc.), and session resume exposes explicit `thread/resume`/`unsupported` capability state — all TDD RED-first.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 03-05-01 | RED tests — trust boundary, adapter-swap, provider errors, session resume | 2c5fd6f7 | sandbox-runner.test.ts, session-resume.test.ts |
| 03-05-02 | resolveAgentRunConfig + DEFAULT_ARTIFACT_GLOB re-export | be5c154b | resolve-agent-run-config.ts, sandbox-runner.ts |
| 03-05-03 | Sandcastle doctor checks with sandbox-docker/podman + runAll export | d528ce67 | +page.server.ts, page.server.test.ts |
| 03-05-04 | Artifact glob coverage — configured vs DEFAULT_ARTIFACT_GLOB tests | e43f6074 | artifact-harvest-hook.test.ts |
| 03-05-05 | Session resume — thread/resume Codex path, unsupported capability state | d2a617b4 | session-resume.ts, session-resume.test.ts |

## Verification

- `bun test src/orchestration/sandbox-runner.test.ts` — 33 pass, 0 fail
- `bun test src/orchestration/artifact-harvest-hook.test.ts` — 8 pass, 0 fail
- `bun test src/orchestration/__tests__/session-resume.test.ts src/orchestration/__tests__/token-tracking.test.ts` — 17 pass, 0 fail
- `bun run ci` — typecheck ✓, symphony:lock ✓, symphony:conformance ✓, trpc:permissions ✓, test ✓, license-audit ✓, ci:codegen ✓, build:all ✓
  - `web:check` fails with SIGABRT (pre-existing svelte-check OOM crash; not introduced by this plan — documented in 03-01 through 03-04 SUMMARYs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `runAll` not exported from doctor page server**
- **Found during:** Task 03-05-03 (test run)
- **Issue:** `page.server.test.ts` calls `mod.runAll()` but `_runAll` was private; all 10 existing doctor tests were failing
- **Fix:** Added `export const runAll = _runAll` to `+page.server.ts`
- **Files modified:** `src/web/src/routes/doctor/+page.server.ts`
- **Commit:** d528ce67 (same task commit)

**2. [Rule 1 - Bug] Session-resume test strict `toEqual` failed after adding optional fields to result**
- **Found during:** Task 03-05-05 (test run)
- **Issue:** Existing tests used `toEqual({attempted, coldStart})` which fails when result now includes `capability` and `resumeVia` fields
- **Fix:** Changed strict `toEqual` to `toMatchObject` or individual property assertions; added explicit `capability:"unsupported"` assertion for the unsupported-profile test
- **Files modified:** `src/orchestration/__tests__/session-resume.test.ts`
- **Commit:** d2a617b4 (same task commit)

## Known Stubs

None — all implemented behaviors are wired to real logic.

## Requirements Addressed

SND-01, SND-02, SND-03, SND-04, SND-05, SND-06, SYM-23, SYM-24

## Self-Check: PASSED
