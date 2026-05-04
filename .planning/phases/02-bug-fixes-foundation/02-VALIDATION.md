---
phase: 2
slug: bug-fixes-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test`, Vitest, Playwright |
| **Config file** | `package.json`, `scripts/ci.ts`, `src/web/package.json`, `src/web/vitest.config.ts`, `src/web/playwright.config.ts` |
| **Quick run command** | Plan-specific `bun test <file>` / `cd src/web && bun run check` |
| **Full suite command** | `bun run ci` |
| **Estimated runtime** | Unknown until Phase 2 CI gates settle |

---

## Sampling Rate

- **After every RED test commit:** Run the exact command expected to fail and capture output.
- **After every GREEN fix commit:** Re-run the same command and capture passing output.
- **After every plan wave:** Run `bun run ci`.
- **Before `$gsd-verify-work`:** `bun run ci` must pass.
- **Max feedback latency:** one plan-local test command before each full CI run.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-ci-red | TBD | 1 | BUG-03, BUG-04, BUG-16 | — | N/A | unit/toolchain | `cd src/web && bun run check` / `bun run ci` | ✅ | ⬜ pending |
| 02-binary-red | TBD | 1 | BUG-01 | — | N/A | repro script | compiled `dist/fulcrum-* product init --json` | ✅ | ⬜ pending |
| 02-installer-red | TBD | 1 | BUG-02, BUG-06, BUG-07, BUG-08, BUG-10, BUG-11, BUG-13, BUG-14 | T-02-installer-ownership | User-owned files/plugins not removed or rewritten | unit | `bun test src/cli/install.test.ts src/cli/uninstall.test.ts` | ✅ | ⬜ pending |
| 02-cli-runtime-red | TBD | 2 | BUG-09, BUG-12, BUG-15, BUG-18 | — | N/A | unit/browser/tooling | plan-specific `bun test ...` plus `lizard ...` for BUG-15 | ✅ | ⬜ pending |
| 02-foundation-db | TBD | 2 | FND-01, FND-03, FND-06, FND-07 | T-02-tenant-isolation | Tenant data scoped by org and composite indexes present | unit/integration | `bun test tests/db src/product-kernel/tenant-settings.test.ts tests/flags/registry.test.ts` | ✅ | ⬜ pending |
| 02-permissions | TBD | 2 | FND-02 | T-02-permission-bypass | Protected procedures cannot bypass permission lint | unit/integration/lint | `bun test tests/trpc/router.test.ts tests/trpc/app-router-scaffold.test.ts` | ✅ | ⬜ pending |
| 02-worker-auth | TBD | 3 | FND-04, FND-05 | — | N/A | unit/integration | `bun test tests/artifacts/worker.test.ts src/cli/commands/auth.test.ts src/tui/screens/auth.test.ts` or created equivalents | ⚠️ some missing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Plans must create missing RED tests before fixes.
- [ ] Plans must name exact failing command/output for each RED task.
- [ ] Plans touching schema must include explicit `fulcrum db migrate` verification.
- [ ] Plans must preserve separate RED commits.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-platform compiled binary on Linux | BUG-01 | Current host is macOS; Linux binary can be built but not always executed locally | Build `dist/fulcrum-linux-*`; run in Linux CI/container when available |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or explicit repro command
- [ ] No bug fix without preceding RED evidence
- [ ] Wave-level `bun run ci` runs after plan completion
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
