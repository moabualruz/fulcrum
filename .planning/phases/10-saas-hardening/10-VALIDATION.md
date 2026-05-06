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
| 10-10-01 | 10 | 5 | CLOSURE-01,CLOSURE-02,CLOSURE-04,CLOSURE-05 | T10-10-01 | Foundational deferred items are closed or recorded as environment blockers without public stubs. | integration | `bun test tests/cli/auth-session.test.ts tests/context/repo-state-bundle.test.ts tests/platform/static-proof.test.ts tests/trpc/app-router-scaffold.test.ts` | W0 | pending |
| 10-11-01 | 11 | 6 | CLOSURE-06..13 | T10-11-01 | Product deferred features are tenant-scoped and surface-parity complete. | integration | `bun test tests/closure/product-features.test.ts tests/closure/product-surface-parity.test.ts tests/search/meilisearch-adapter.test.ts tests/search/ai-qa.test.ts` | W0 | pending |
| 10-12-01 | 12 | 7 | CLOSURE-03,CLOSURE-13..17 | T10-12-01 | External/hosted adapters are config-gated, authenticated, and local-first safe. | integration | `bun test tests/closure/integrations.test.ts tests/closure/notification-workflows.test.ts tests/closure/enterprise-hardening.test.ts tests/cli/formatting.test.ts` | W0 | pending |
| 10-13-01 | 13 | 8 | CLOSURE-16,CLOSURE-18 | T10-13-01 | Huashu Web/CLI/TUI design gates and final parity matrix pass. | ui/integration | `bun test tests/web/phase10-huashu-routes.test.ts tests/cli/phase10-huashu-cli.test.ts tests/tui/phase10-huashu-tui.test.ts tests/platform/phase10-parity-matrix.test.ts` | W0 | pending |

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
- [ ] `tests/closure/product-features.test.ts` — closure product features.
- [ ] `tests/closure/product-surface-parity.test.ts` — closure Web/CLI/TUI/API parity.
- [ ] `tests/closure/integrations.test.ts` — Slack/Discord/email/external tracker adapters.
- [ ] `tests/closure/notification-workflows.test.ts` — workflow designer and channel gates.
- [ ] `tests/closure/enterprise-hardening.test.ts` — billing, quotas, attestation, SIEM, OTel, encryption verification.
- [ ] `tests/web/phase10-huashu-routes.test.ts` — Huashu Web operational-route gate.
- [ ] `tests/cli/phase10-huashu-cli.test.ts` — CLI information hierarchy and formatting gate.
- [ ] `tests/tui/phase10-huashu-tui.test.ts` — TUI keyboard/plain-text gate.
- [ ] `tests/platform/phase10-parity-matrix.test.ts` — SAS and CLOSURE parity matrix.
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
