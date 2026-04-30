# 26 — Complexity reduction (lizard hot spots)

Status: ready-for-agent
Risk tier: low
Dependencies: 18
Source: `.scratch/claude-migration-review/REPORT.md` C10
File ownership:
- `src/components/adapters/vendor.ts`
- `src/components/executor.ts`
- `src/cli/package-surfaces.ts`
- `src/cli/package-mirror.ts`

Acceptance criteria:
- `lizard` over the listed files reports CCN ≤ 15 for every function (project default threshold).
- Behavior is preserved (existing tests still pass).
- Refactor only — no scope creep.
