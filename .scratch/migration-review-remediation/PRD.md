# Migration Review Remediation

Status: ready-for-agent
Source: `.scratch/claude-migration-review/REPORT.md` (2026-04-30)

> **Goal:** Fix the release blockers and high-severity gaps the post-migration review surfaced before merging the feature branches to `main`.

**Architecture:** Same Bun TypeScript stack. Targeted patches across `src/cli/{install,uninstall,product,doctor,component}.ts`, `src/cli/{repomix-package,vendor-packages,upstream-skills,skills}.ts`, `src/cli/{mcp-registry,package-parity}.ts`, `src/product-kernel/markdown.ts`, `src/web`, `tsconfig.json`, `scripts/ci.ts`, and the scratch tracker.

**Tech stack:** Bun, `bun:test`, smol-toml, SvelteKit, gitleaks, semgrep, lizard.

**Branch policy:** Stay on `feat/product-kernel` for product-kernel-touching fixes; create a small remediation branch only if cross-feature concerns appear. Merge order at end: `feat/component-lifecycle-management` → `main`, `feat/plugin-extension-surface-parity` → `main`, `feat/product-kernel` → `main`. No PRs (per user instruction).

## Severity buckets (from `claude-migration-review/REPORT.md`)

- **critical (release blocker):** A1, C1.
- **high:** A2, A3, A4, C2, C3, C4, F1, F2.
- **medium:** A5, A6, A7, C5, C6, C7, C8, C9, F3, F4, S1.
- **low:** C10, S2, S3.

## Issue index

| Issue | Sourced from | Risk tier |
|---|---|---|
| `13-compiled-binary-pglite-compat` | C1 | high |
| `14-web-ci-and-typecheck` | C2, C3 | high |
| `15-frontmatter-byte-stability` | C4 | high |
| `16-product-cli-flag-parser` | C6 | medium |
| `17-component-status-filesystem-audit` | C7 | medium |
| `18-package-parity-native-surface-audit` | C8 | medium |
| `19-doctor-product-kernel-verdict` | C9 | medium |
| `20-scratch-workflow-repair` | F3, F4 | medium |
| `21-agent-install-uninstall-safety` | A1, A4 | high |
| `22-targeted-agent-config-patchers` | A2, A3, A5 | high |
| `23-agent-cache-and-skill-ownership` | A6, A7 | medium |
| `24-merge-cascade-to-main` | F1, F2 | high |
| `25-shadcn-svelte-and-adapter-node` | C5 | low |
| `26-complexity-reduction` | C10 | low |
| `27-security-and-dependency-followups` | S1, S2, S3 | low |

## Execution order

1. Wave A (run in this `feat/product-kernel` branch): `21`, `22`, `23` (safety blockers), `13` (binary), `14` (web CI), `15` (frontmatter), `16` (CLI), `17`, `18`, `19`, `20` (workflow repair).
2. Wave B: `25`, `26`, `27` if time permits or as follow-ups.
3. Wave C: `24` (merge cascade) — last, after the above land and CI is green on each branch.

## Acceptance gate

- `bun run ci` green at the tip of every feature branch.
- `cd src/web && bun run check` green.
- `./dist/fulcrum-darwin-arm64 product init --json` succeeds against a temp `FULCRUM_HOME`.
- `claude plugin install/uninstall` calls only fire when a Fulcrum ownership marker exists or `--allow-claude-cli` is passed.
- All issues `Status: done` or explicitly parked.
