# 24 — Merge cascade to `main`

Status: ready-for-agent
Risk tier: high
Dependencies: 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
Source: `.scratch/claude-migration-review/REPORT.md` F1, F2 + user instruction "merge all sub-branches to feature branch then merge feature to main"
File ownership: branches only (no source files)

Acceptance criteria:
- `feat/component-lifecycle-management` is merged into `main` (`--no-ff`) with `bun run ci` green afterwards.
- `feat/plugin-extension-surface-parity` is merged into `main` (`--no-ff`) with `bun run ci` green afterwards.
- `feat/product-kernel` is merged into `main` (`--no-ff`) with `bun run ci` green afterwards.
- `git push origin main` succeeds; `git status` reports `main` in sync with `origin/main`.
- HANDOVER.md updated to reflect post-merge state.
- No PRs opened (per user instruction).
