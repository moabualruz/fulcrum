# 17 — Component status filesystem audit

Status: ready-for-agent
Risk tier: medium
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C7
File ownership:
- `src/cli/component.ts`
- `src/cli/component.test.ts`
- `src/components/ledger.ts`

Acceptance criteria:
- `fulcrum component status --json` reports `state: "missing"` when a managed file recorded in the ledger no longer exists on disk.
- Reports `modified: true` when the on-disk SHA-256 differs from the ledger artifact hash.
- Existing happy-path tests still pass.
- New tests exercise both states.
