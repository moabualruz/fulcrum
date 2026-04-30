# 12 — Package parity in component status and doctor (Wave D2)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/06, plugin-extension-surface-parity/11
File ownership:
- `src/cli/component.ts`
- `src/cli/component.test.ts`
- `src/cli/doctor.ts`
- `src/cli/doctor.test.ts`

Acceptance criteria:
- `fulcrum component status package.<name> --json` returns parity reports per agent with unsupported reasons.
- `fulcrum doctor --json` includes package parity, package-owned MCPs, source-only leak checks.

## Comments
- Shipped via parity series and `b889a4b docs(handover): record plugin mirror status`.
