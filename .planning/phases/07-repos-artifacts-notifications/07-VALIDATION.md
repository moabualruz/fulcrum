---
phase: 07
slug: repos-artifacts-notifications
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-05
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test |
| **Config file** | `package.json` |
| **Quick run command** | `bun test <changed-test-file>` |
| **Full suite command** | `bun run ci` |
| **Estimated runtime** | quick: ~5-30s; full: project-dependent |

---

## Sampling Rate

- **After every task commit:** Run focused `bun test <changed-test-file>` from the task `<verify><automated>` command.
- **After every plan wave:** Run relevant domain-focused tests listed below for completed wave.
- **Before `$gsd-verify-work`:** `bun run ci` must be green.
- **Max feedback latency:** 30 seconds for focused tests where possible.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | REP-01, REP-02, REP-03 | T-07-REP-* | repo path/sync jobs org-scoped | unit/integration | `bun test src/repos/**/*.test.ts` | W0 | pending |
| 07-02-01 | 02 | 1 | ART-03, ART-04 | T-07-ART-* | pruner deletes only eligible scoped artifacts | unit/integration | `bun test src/artifacts/**/*.test.ts` | W0 | pending |
| 07-03-01 | 03 | 1 | NTF-04, NTF-05, NTF-06 | T-07-NTF-* | delivery secrets masked; HMAC signed; quiet-hours held | unit/integration | `bun test src/notifications/**/*.test.ts src/webhooks/**/*.test.ts` | W0 | pending |
| 07-04-01 | 04 | 2 | REP-04, REP-05, REP-06 | T-07-REP-* | REST/tRPC repo paths enforce org scope | router/CLI | `bun test src/trpc/routers/repos.test.ts src/cli/commands/repos.test.ts` | W0 | pending |
| 07-05-01 | 05 | 3 | REP-07 | T-07-REP-* | Web/CLI/TUI read same repo fields | parity | `bun test src/tui/repos-browser.test.ts src/cli/commands/repos.test.ts` | W0 | pending |
| 07-06-01 | 06 | 3 | ART-01, ART-02, ART-05 | T-07-ART-* | artifact edges/search scoped by org/run | integration | `bun test src/artifacts/__tests__/harvest-search.test.ts` | W0 | pending |
| 07-07-01 | 07 | 3 | NTF-01 | T-07-NTF-* | events fan out once and respect mutes/rules | integration | `bun test src/notifications/__tests__/fanout.test.ts` | W0 | pending |
| 07-08-01 | 08 | 4 | NTF-04, NTF-05, NTF-06 | T-07-NTF-* | SMTP/webhook/push workers record attempts and retry safely | integration | `bun test src/notifications/__tests__/delivery-worker.test.ts` | W0 | pending |
| 07-09-01 | 09 | 4 | NTF-02, NTF-03, NTF-07, NTF-08 | T-07-NTF-* | unread count uses Notification rows only | router/UI/CLI | `bun test src/trpc/routers/notifications.test.ts src/web/src/routes/settings/notifications/page.server.test.ts` | W0 | pending |
| 07-10-01 | 10 | 5 | ART-06, NTF-09 | T-07-FINAL-* | download/delete org scoped; webhook secrets masked | security/parity | `bun test src/artifacts/__tests__/phase07-security.test.ts src/cli/__tests__/phase07-parity-smoke.test.ts` | W0 | pending |

---

## Wave 0 Requirements

- [ ] Create missing RED test files listed as W0 in the Per-Task Verification Map before GREEN implementation in each plan.
- [ ] Ensure every destructive artifact path has an authorization test before implementation.
- [ ] Ensure every notification delivery channel has an attempt-recording test before implementation.

---

## Manual-Only Verifications

All phase behaviors have automated verification planned. Browser visual review may supplement Web UI routes but must not replace tests.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing RED references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 30s for focused tests.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-05
