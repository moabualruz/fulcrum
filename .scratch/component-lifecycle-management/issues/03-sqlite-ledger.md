# 03 — SQLite ledger

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/01
File ownership:
- `src/components/ledger.ts`
- `src/components/ledger.test.ts`

Acceptance criteria:
- Ledger creates `components`, `surfaces`, `artifacts`, `operations`, `operation_steps` tables on first open.
- Schema version recorded via `PRAGMA user_version`.
- Reopening an existing ledger is idempotent.
- Operation rows record start/end timestamps and final status.

## Comments
- Shipped in `b858220 feat(component): add lifecycle foundation`. Verified by `bun test src/components/ledger.test.ts`.
