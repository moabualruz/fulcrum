# 13 — Vendor project integrations audit (Wave E1)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/12
File ownership:
- `src/cli/vendor-installs.ts`
- `src/cli/init.test.ts`
- `src/components/catalog.ts`
- `src/components/catalog.test.ts`
- `src/components/adapters/vendor.ts`
- `src/components/adapters/vendor.test.ts`

Acceptance criteria:
- graphify, ast-grep, tavily appear in `component status`/`doctor` as managed vendor integrations.
- Remove/status behavior or explicit non-removable/manual reason recorded for vendor commands lacking uninstall.

## Comments
- Shipped via parity series.
