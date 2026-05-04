---
phase: 03
slug: symphony-sandcastle
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-04
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` root; Playwright/Vitest for web surface checks when needed |
| **Config file** | `package.json`, `scripts/ci.ts`, `src/web/package.json` |
| **Quick run command** | `bun test src/orchestration/__tests__/symphony-conformance.test.ts` |
| **Full suite command** | `bun run ci` |
| **Estimated runtime** | quick ~10-30s, full CI project-dependent |

---

## Sampling Rate

- **After every task commit:** Run the focused test command named in that task.
- **After every plan wave:** Run `bun test src/orchestration/__tests__/symphony-conformance.test.ts` plus all touched focused test files.
- **Before `$gsd-verify-work`:** `bun run ci` must be green.
- **Max feedback latency:** one focused test command per task; no three consecutive code tasks without automated verification.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-* | 01 | 1 | SYM-01..04, SYM-14, SYM-21, SYM-26 | T-03-01 | Invalid workflow/prompt/policy cannot dispatch silently | unit/integration | `bun test src/orchestration/symphony/*.test.ts src/orchestration/__tests__/symphony-conformance.test.ts` | W0 | pending |
| 03-02-* | 02 | 1 | SYM-05..08, SYM-15..18 | T-03-02 | Only eligible native tracker issues dispatch; blockers enforced | unit/integration | `bun test src/orchestration/__tests__/symphony-conformance.test.ts` | W0 | pending |
| 03-03-* | 03 | 2 | SYM-09..13, SYM-19, SYM-27 | T-03-03 | Retry/stall/reconcile cannot leak or double-run workspaces | unit/integration | `bun test src/orchestration/__tests__/symphony-conformance.test.ts` | W0 | pending |
| 03-04-* | 04 | 2 | SYM-20, SYM-22, SYM-23 | T-03-04 | App-server events cannot stall, lose session IDs, or double-count tokens | unit/fake protocol | `bun test src/orchestration/symphony/app-server-client.test.ts src/orchestration/__tests__/symphony-conformance.test.ts` | W0 | pending |
| 03-05-* | 05 | 3 | SND-01..06, SYM-24 | T-03-05 | Agent/provider config cannot silently fall back to unsafe or unsupported behavior | unit/integration | `bun test src/orchestration/sandbox-runner.test.ts src/orchestration/__tests__/session-resume.test.ts src/orchestration/__tests__/token-tracking.test.ts` | W0 | pending |
| 03-06-* | 06 | 3 | SYM-25, SND-06 | T-03-06 | Dispatch surfaces route through canonical APIs and expose only intended control actions | unit/e2e | `bun test src/trpc/routers/orchestration.test.ts src/cli/symphony.test.ts src/tui/**/*.test.ts` | W0 | pending |

---

## Wave 0 Requirements

- [ ] `src/orchestration/__tests__/symphony-conformance.test.ts` contains RED tests for every §17.1-17.7 required behavior.
- [ ] `src/orchestration/symphony/app-server-client.test.ts` exists before app-server client implementation.
- [ ] Surface dispatch tests exist before wiring Web/CLI/TUI dispatch actions.
- [ ] `docs/symphony-conformance.md` remains generated from `scripts/gen-conformance-trace.ts`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real installed CLI agents launch | SND-03, SND-06 | Local credentials and binaries vary by machine | Run opt-in smoke command for available `codex`, `claude`, `opencode`, `gemini`, `pi`; skipped binaries must be reported as skipped. |
| Cloud sandbox providers | SND-03, SND-04 | Requires external credentials/provider access | Enable each provider flag with valid env vars and run doctor/provider smoke; missing drivers must fail clearly. |

---

## Validation Sign-Off

- [ ] All tasks have automated verification or explicit manual-only reason.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all required conformance test stubs.
- [ ] No watch-mode flags in verification commands.
- [ ] `bun run ci` green before phase completion.
- [ ] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
