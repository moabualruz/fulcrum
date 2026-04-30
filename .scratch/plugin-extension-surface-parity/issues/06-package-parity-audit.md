# 06 — Package parity audit (Wave B3)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/04, plugin-extension-surface-parity/05
File ownership:
- `src/cli/package-parity.ts`
- `src/cli/package-parity.test.ts`

Acceptance criteria:
- Counts source vs installed surfaces per package/agent.
- Detects missing targets, unsupported targets, `.original.md` leaks.
- Returns a `PackageParityReport` shape consumable by `component status` and `doctor`.

## Comments
- Shipped via the parity series.
