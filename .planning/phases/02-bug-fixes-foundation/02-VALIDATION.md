---
phase: 2
slug: bug-fixes-foundation
status: passed
nyquist_compliant: true
wave_0_complete: true
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
| **Estimated runtime** | Verified by final `bun run ci` pass on 2026-05-04 |

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
| 02-ci-red | 02-01 | 1 | BUG-03, BUG-04, BUG-16 | — | N/A | unit/toolchain | `cd src/web && bun run check` / `bun run ci` | ✅ | ✅ green |
| 02-binary-red | 02-02 | 1 | BUG-01 | — | N/A | repro script | compiled `dist/fulcrum-* product init --json` | ✅ | ✅ green |
| 02-installer-red | 02-03 | 1 | BUG-02, BUG-06, BUG-07, BUG-08, BUG-10, BUG-11, BUG-13, BUG-14 | T-02-installer-ownership | User-owned files/plugins not removed or rewritten | unit | `bun test src/cli/install.test.ts src/cli/uninstall.test.ts` | ✅ | ✅ green |
| 02-cli-runtime-red | 02-05 | 2 | BUG-09, BUG-12, BUG-15, BUG-18 | — | N/A | unit/browser/tooling | plan-specific `bun test ...` plus `lizard ...` for BUG-15 | ✅ | ✅ green |
| 02-foundation-db | 02-06 | 2 | FND-01, FND-03, FND-06, FND-07 | T-02-tenant-isolation | Tenant data scoped by org and composite indexes present | unit/integration | `bun test tests/db src/product-kernel/tenant-settings.test.ts tests/flags/registry.test.ts` | ✅ | ✅ green |
| 02-permissions | 02-07 | 2 | FND-02 | T-02-permission-bypass | Protected procedures cannot bypass permission lint | unit/integration/lint | `bun test tests/trpc/router.test.ts tests/trpc/app-router-scaffold.test.ts` | ✅ | ✅ green |
| 02-worker-auth | 02-08 | 3 | FND-04, FND-05 | — | N/A | unit/integration | `bun test tests/workers/registry.test.ts tests/artifacts/worker.test.ts` plus auth parity tests in root CI | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Plans must create missing RED tests before fixes.
- [x] Plans must name exact failing command/output for each RED task.
- [x] Plans touching schema must include explicit `fulcrum db migrate` verification.
- [x] Plans must preserve separate RED commits.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-platform compiled binary on Linux | BUG-01 | Current host is macOS; Linux binary can be built but not always executed locally | Build `dist/fulcrum-linux-*`; run in Linux CI/container when available |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit repro command
- [x] No bug fix without preceding RED evidence
- [x] Wave-level `bun run ci` runs after plan completion
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed
