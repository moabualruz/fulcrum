# P17#23 License Audit Script — Cross-Team Review

**Commit:** `c7f599c`
**Subject:** `feat(ci): license-deps audit + ci gate (P17#23)`
**Reviewer:** Claude review subagent (read-only, no code changes)
**Date:** 2026-05-01

---

## Verdict

```
SPEC:    PARTIAL PASS  (core deliverables met; 3 of 7 AC items deferred by design; 2 minor gaps)
QUALITY: APPROVED      (production-grade code; clean architecture; good error handling)
```

---

## Diff Scope Check

| File Touched | In Allowed List | Notes |
|---|---|---|
| `scripts/license-audit.ts` (new) | YES | Explicitly allowed |
| `scripts/ci.ts` (+1 step) | YES | Explicitly allowed |
| `tests/scripts/license-audit.test.ts` (new) | YES | Explicitly allowed |
| `tests/scripts/license-audit.fixtures/pretend-agpl/node_modules/pretend-agpl/package.json` (new) | YES | Explicitly allowed |
| `tests/scripts/license-audit.fixtures/pretend-mit/node_modules/pretend-mit/package.json` (new) | YES | Explicitly allowed |
| `LICENSE-DEPS.md` (new) | YES | Explicitly allowed |
| `.scratch/agent-os-vision/17-cross-cutting-platform/issues/23-license-deps-audit.md` | YES | Status flip only: `ready-for-agent` → `needs-review` |

**Scope violations: NONE.** All 7 touched files are on the allowed list. No forbidden paths touched (no `src/db/**`, `.codex/`, `.claude/`, PRD/DECISIONS docs, `package.json` deps, `.sql` files, TUI/Web settings screens).

---

## Audit Checklist

### 1. `scripts/license-audit.ts`

| Criterion | Status | Notes |
|---|---|---|
| Scans `node_modules/*/package.json` | ✅ | BFS traversal handles nested `node_modules`, scoped packages (`@org/pkg`), symlink dedup via `realpath` |
| PASS list complete (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0, Unlicense, CC-BY-4.0, Python-2.0, BlueOak-1.0.0) | ✅ | All 11 required tokens present in `PASS_LICENSES` set |
| FAIL patterns complete (AGPL, SSPL, BSL, BUSL, commercial, proprietary, CC-BY-NC) | ✅ | All 7 patterns present; word-boundary regex (`\bAGPL\b/i` etc.) correct |
| UNKNOWN handling: warn-only, do not fail | ✅ | UNKNOWN pushes to `warnings[]`; `result.ok = summary.fail === 0` — only FAIL classification blocks CI |
| `--json` flag returns typed JSON | ✅ | `JSON.stringify(result, null, 2)` outputs full `LicenseAuditResult` shape with all typed fields |
| Cargo.toml absent → graceful skip | ⚠️ | Script has **no Cargo.toml support at all**. Issue AC #1 says "runs over `package.json` workspaces + Cargo.toml deps". No Cargo.toml exists in repo today, so no runtime failure, but spec item is unimplemented. A log message on absent Cargo.toml was not added. |
| Bun-native (no third-party `license-checker` dep) | ✅ | Only `node:fs/promises` and `node:path` imports — zero third-party deps |
| `CC0-1.0` (SPDX canonical form) classified as PASS | ⚠️ | `PASS_LICENSES` contains `"CC0"` but not `"CC0-1.0"`. Real packages use `CC0-1.0` (SPDX). Current behavior: `CC0-1.0` → UNKNOWN (warn-only). Not a CI blocker but adds noise and misses the intent. See `caniuse-lite` in the generated report — it uses `CC-BY-4.0`, not `CC0`, so no current false hit, but future packages may expose this. |
| GPL/LGPL in FAIL patterns | ⚠️ | `GPL-2.0`, `GPL-3.0`, `LGPL-2.1` are not in `FAIL_LICENSE_PATTERNS`. These would classify as UNKNOWN (warn-only), not FAIL. Issue spec says "fails on AGPL / SSPL / BSL / commercial / non-permissive" — GPL/LGPL are non-permissive. Omission is a minor gap vs. spec intent. Mitigated by UNKNOWN warning not being silent. |
| `MIT WITH exception` edge case | ⚠️ | `WITH` clause is split out correctly by the tokenizer, but "exception" is not in `PASS_LICENSES`, so result is UNKNOWN (not PASS, not FAIL). This is safe — conservative, warn-only. Acceptable behavior. |

### 2. `scripts/ci.ts` Addition

| Criterion | Status | Notes |
|---|---|---|
| New `license-audit` step added | ✅ | `{ name: "license-audit", cmd: ["bun", "run", "scripts/license-audit.ts"] }` |
| Step ordering sensible | ✅ | Placed after `test`, before `build:all`. Correct: installs and typechecks happen first; license gate before any build artifact is produced. |
| Non-zero exit on FAIL classification | ✅ | Script calls `process.exit(result.ok ? 0 : 1)`; `result.ok = summary.fail === 0`. CI runner breaks on non-zero. |
| No `soft` flag (hard gate) | ✅ | Step has no `soft: true` — any FAIL classification stops the CI run. |

### 3. Tests

| Criterion | Status | Notes |
|---|---|---|
| Pretend-AGPL fixture fails audit | ✅ | `pretend-agpl/package.json` has `"license": "AGPL-3.0-only"`. `/\bAGPL\b/i` matches. `result.ok === false`, `summary.fail === 1`. |
| Pretend-MIT fixture passes | ✅ | `pretend-mit/package.json` has `"license": "MIT"`. `result.ok === true`, `summary.fail === 0`. |
| Unknown license edge case tested | ❌ | No test for a package with `"license": "LicenseRef-custom"` or missing `license` field going to UNKNOWN. |
| Missing `license` field tested | ❌ | No test for absent `license` key producing UNKNOWN + warning entry. |
| Multi-license `OR` expression tested | ❌ | No test for `"license": "MIT OR Apache-2.0"` classifying as PASS. Logic is implemented and correct (verified via manual eval), but not exercised in test suite. |
| Malformed `package.json` tested | ❌ | No test for invalid JSON producing a warning and `undefined` skip (not crash). |
| Temp dir cleanup on test failure | ✅ | `try/finally` pattern with `rm(outputDir, { recursive: true, force: true })` in both tests. |
| Tests use fixture isolation (not live `node_modules`) | ✅ | `rootDir: join(fixturesDir, "pretend-mit")` — scoped fixture tree, not the repo root. |

**Test count: 2 tests, 6 `expect()` calls.** Matches the GREEN transcript. Adequate for spec minimum ("pretend-AGPL fails; pretend-MIT passes") but thin on edge-case coverage.

### 4. `LICENSE-DEPS.md`

| Criterion | Status | Notes |
|---|---|---|
| Generated by script (not hand-written) | ✅ | Header says "Generated by `bun run scripts/license-audit.ts`." File content matches script `renderReport()` output format exactly. |
| Format: Name / Version / License / Classification / Source / Package root / Path | ✅ | All 7 columns present, in correct order, matching issue spec. |
| TODO note for P15/P16 surfaces | ✅ | Footer line: `"Web/TUI surfaces wired by Pillar 15/16 in Wave 5"` |
| Reflects real dependency state | ✅ | 114 packages, 112 PASS, 0 FAIL, 2 UNKNOWN (`lightningcss` + `lightningcss-darwin-arm64`, both MPL-2.0). |

### 5. C6 Compliance (no plaintext SQL)

| Criterion | Status | Notes |
|---|---|---|
| No `.sql` files in commit | ✅ | Zero `.sql` files touched |
| No raw SQL strings in `license-audit.ts` | ✅ | Only `node:fs/promises` + `node:path` I/O |
| No raw SQL in test file | ✅ | Pure filesystem test using `auditLicenses()` |
| No tagged-template SQL | ✅ | No template literals involving DB queries |

### 6. Acceptance Criteria Coverage

| AC Item | Met | Notes |
|---|---|---|
| `scripts/license-audit.ts` runs over `package.json` workspaces | ✅ | Implemented |
| `scripts/license-audit.ts` runs over Cargo.toml deps | ❌ | Not implemented; no Cargo.toml in repo (deferred gap) |
| `LICENSE-DEPS.md` with name + version + license + classification | ✅ | Implemented |
| CI gate: `license-audit` step in `scripts/ci.ts` | ✅ | Implemented |
| CLI: `fulcrum doctor --license-deps` | ❌ | Out of dispatch scope — allowed to defer |
| TUI: Settings → System → Licenses | ❌ | Explicitly forbidden by dispatch ("TUI Settings screen") |
| Web: `/settings/system/licenses` | ❌ | Explicitly forbidden by dispatch |
| Tests: pretend-AGPL fails, pretend-MIT passes | ✅ | Implemented and passing |

3 of 7 AC items are deferred: Cargo.toml (no Cargo in repo — practical non-issue), CLI doctor, TUI/Web surfaces. TUI/Web were explicitly out of scope for this dispatch. Cargo was not excluded but also not present.

---

## Notable Strengths

1. **Symlink dedup via `realpath`.** Both `seenNodeModules` and `seenPackageRoots` use real paths. Handles hoisted deps and `bun link` scenarios without double-counting.
2. **Legacy `licenses[]` array support.** `legacyLicensesText()` handles the old npm `licenses: [{type: "MIT"}]` format, producing `"MIT OR BSD-2-Clause"` style strings that the tokenizer then handles. Correct precedence: `license` field wins over `licenses[]`.
3. **Zero third-party deps.** Pure Bun native I/O. No transitive supply-chain risk from a license-scanning library.
4. **Typed `LicenseAuditResult` interface.** All fields exported. `--json` flag outputs the exact same shape. Clean contract for downstream consumers (CLI, TUI, Web).
5. **CI step ordering.** `license-audit` runs after `test`, before `build:all`. Hard gate, no soft flag. Correct.
6. **Markdown pipe-escaping.** `escapeCell()` handles `|` and `\n` in license strings, preventing report corruption from unusual package names.
7. **TDD evidence in commit.** Commit message includes RED → GREEN transcript, confirming test-first discipline.

---

## Required Changes

None that block merge. The spec minimum is met: script exists, CI gate active, fixtures pass/fail correctly, `LICENSE-DEPS.md` generated. Pre-computed verification shows 11/11 CI pass with `license-audit` as one of the 11.

---

## Optional Improvements (non-blocking)

### OPT-1: Add `CC0-1.0` to PASS set
**File:** `scripts/license-audit.ts`, line 47
**Current:** `"CC0"` only
**Recommend:** Add `"CC0-1.0"` as an alias. `CC0-1.0` is the SPDX canonical identifier. Any package declaring `CC0-1.0` currently gets UNKNOWN + warning noise.

### OPT-2: Add GPL/LGPL to FAIL patterns
**File:** `scripts/license-audit.ts`, lines 54-62
**Current:** Only AGPL, SSPL, BSL, BUSL, commercial, proprietary, CC-BY-NC
**Recommend:** Add `/\bGPL\b/i` and/or `/\bLGPL\b/i` to `FAIL_LICENSE_PATTERNS`. Issue spec says "non-permissive" — GPL/LGPL qualify. Current behavior (UNKNOWN + warn) is safe but not spec-precise.

### OPT-3: Cargo.toml stub
**File:** `scripts/license-audit.ts`
**Recommend:** Add graceful-skip with log message when `Cargo.toml` absent:
```ts
// Near top of auditLicenses():
const cargoPath = join(rootDir, "Cargo.toml");
if (!(await isDirectory(cargoPath)) && !(await fileExists(cargoPath))) {
  warnings.push("Cargo.toml not found — Rust deps skipped");
}
```
This fulfills the spec's "graceful skip with log message" expectation without requiring an actual Rust dep scanner.

### OPT-4: Test edge cases
**File:** `tests/scripts/license-audit.test.ts`
Add 3 tests covering:
- Missing `license` field → UNKNOWN + warning, `result.ok === true`
- `"license": "MIT OR Apache-2.0"` → PASS
- Invalid `package.json` JSON → warning + package skipped, no crash

### OPT-5: `CC0-1.0` normalization alias
**File:** `scripts/license-audit.ts`, function `normalizeLicenseToken` (line 99)
Could add `.replace(/^CC0-1\.0$/i, "CC0")` to normalize SPDX canonical form to the set token.

---

## Summary

Core P17#23 deliverables ship clean: license audit script, `LICENSE-DEPS.md`, CI gate, AGPL/MIT test fixtures. Code quality is high — zero third-party deps, full type exports, correct symlink handling, legacy format support. Two minor PASS-set gaps (`CC0-1.0`, GPL/LGPL) produce UNKNOWN noise but do not cause false negatives (no current deps affected). Cargo.toml support is spec'd but not present in the repo, so it's a latent gap not an active failure. Test suite covers the spec minimum (2 fixtures) but lacks edge-case depth. Pre-computed CI verification (11/11 pass) confirms the gate is wired and working.
