---
phase: 10
slug: saas-hardening
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-06
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for PostgreSQL SaaS hardening execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test + Playwright |
| **Config file** | `package.json`, `tests/postgres/test-utils.ts` after Wave 0 |
| **Quick run command** | `bun test tests/postgres` |
| **Full suite command** | `bun run ci` |
| **Estimated runtime** | ~180 seconds with Testcontainers cold start |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/postgres`
- **After every plan wave:** Run `bun run ci`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-00-01 | 00 | 0 | SAS-06 | T10-00-01 | PostgreSQL test harness starts real Postgres and fails closed without DB URL. | integration | `bun test tests/postgres` | W0 | pending |
| 10-00-02 | 00 | 0 | SAS-01 | T10-00-02 | Cross-org reads and writes are rejected across core domains. | integration | `bun test tests/postgres/tenant-isolation.test.ts` | W0 | pending |
| 10-00-03 | 00 | 0 | SAS-04 | T10-00-03 | Org switching and member management require valid session and role. | integration | `bun test tests/postgres/org-auth.test.ts` | W0 | pending |
| 10-00-04 | 00 | 0 | SAS-02 | T10-00-04 | Pool exhaustion, idle cleanup, and failure recovery are observable. | integration | `bun test tests/postgres/pool.test.ts` | W0 | pending |
| 10-00-05 | 00 | 0 | SAS-03 | T10-00-05 | Injected EventBus delivers cross-instance events without singleton coupling. | integration | `bun test tests/postgres/event-bus.test.ts` | W0 | pending |
| 10-00-06 | 00 | 0 | SAS-05 | T10-00-06 | Duplicate worker instances do not double-run unique jobs. | integration | `bun test tests/postgres/graphile-worker.test.ts` | W0 | pending |
| 10-01-01 | 01 | 1 | SAS-02 | T10-01-01 | Postgres pool settings are explicit and surfaced by doctor/status. | integration | `bun test tests/postgres/pool.test.ts` | W0 | pending |
| 10-02-01 | 02 | 1 | SAS-04 | T10-02-01 | Better Auth organization APIs are wrapped by shared tRPC/service logic. | integration | `bun test tests/postgres/org-auth.test.ts` | W0 | pending |
| 10-03-01 | 03 | 1 | SAS-01 | T10-03-01 | `org_id` scoping and RLS prevent tenant leaks and cross-org mutation. | integration | `bun test tests/postgres/tenant-isolation.test.ts` | W0 | pending |
| 10-04-01 | 04 | 2 | SAS-03 | T10-04-01 | EventBus adapters are injectable and cross-instance safe. | integration | `bun test tests/postgres/event-bus.test.ts` | W0 | pending |
| 10-05-01 | 05 | 2 | SAS-05 | T10-05-01 | graphile-worker coordination uses PostgreSQL advisory-lock semantics. | integration | `bun test tests/postgres/graphile-worker.test.ts` | W0 | pending |
| 10-06-01 | 06 | 3 | SAS-04 | T10-06-01 | Web org management calls shared backend paths only. | e2e | `bun test tests/postgres/org-auth.test.ts && bunx playwright test tests/web/org-settings.spec.ts` | W0 | pending |
| 10-07-01 | 07 | 3 | SAS-02,SAS-04 | T10-07-01 | CLI commands use shared caller paths and support `--json`. | integration | `bun test tests/postgres/cli-saas.test.ts` | W0 | pending |
| 10-08-01 | 08 | 3 | SAS-02,SAS-04 | T10-08-01 | TUI commands/screens use shared caller paths and preserve parity. | integration | `bun test tests/postgres/tui-saas.test.ts` | W0 | pending |
| 10-09-01 | 09 | 4 | SAS-01..06 | T10-09-01 | CI exercises all SaaS hardening contracts against PostgreSQL. | ci | `bun run ci` | W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `tests/postgres/test-utils.ts` — PostgreSQL URL/Testcontainers bootstrap and tenant fixtures.
- [ ] `tests/postgres/tenant-isolation.test.ts` — SAS-01 negative matrix for list/get/update/delete across core domains.
- [ ] `tests/postgres/org-auth.test.ts` — SAS-04 Better Auth org switching/member/role matrix.
- [ ] `tests/postgres/pool.test.ts` — SAS-02 pool config/status/failure behavior.
- [ ] `tests/postgres/event-bus.test.ts` — SAS-03 injectable EventBus and cross-instance NOTIFY behavior.
- [ ] `tests/postgres/graphile-worker.test.ts` — SAS-05 advisory-lock/dedupe behavior.
- [ ] `tests/postgres/cli-saas.test.ts` — CLI JSON parity for org/status/audit commands.
- [ ] `tests/postgres/tui-saas.test.ts` — TUI parity smoke tests through shared service/caller boundaries.
- [ ] `tests/web/org-settings.spec.ts` — Web organization settings e2e and accessibility coverage.
- [ ] `package.json` — `postgres:integration` script and Testcontainers dependencies.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** draft 2026-05-06
