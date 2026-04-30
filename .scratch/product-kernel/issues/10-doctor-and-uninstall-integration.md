# 10 — Doctor and uninstall integration

Status: done
Risk tier: medium
Dependencies: product-kernel/05, product-kernel/09
File ownership:
- `src/cli/doctor.ts`
- `src/cli/doctor.test.ts`
- `src/cli/uninstall.ts`
- `src/cli/uninstall.test.ts`
- `HANDOVER.md`

Acceptance criteria:
- `fulcrum doctor [--json]` reports product-kernel `engine`, `schemaVersion`, row counts (orgs/projects/documents/tasks/agent_runs), and latest event timestamp.
- Default `fulcrum uninstall` preserves the product DB.
- `fulcrum uninstall --purge` removes managed product state under `~/.fulcrum/state/product/` only.
- RED tests fail on missing product-kernel behavior in doctor/uninstall; GREEN: `bun test src/cli/doctor.test.ts src/cli/uninstall.test.ts` passes.
- HANDOVER.md updated to reflect product-kernel doctor/uninstall coverage.

## Comments
- Shipped in `c5753f0 feat(product-kernel): wire doctor and uninstall to product DB`.
