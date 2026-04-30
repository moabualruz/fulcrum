# 09 — Component status and doctor integration

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/08
File ownership:
- `src/cli/component.ts`
- `src/cli/component.test.ts`
- `src/cli/doctor.ts`
- `src/cli/doctor.test.ts`

Acceptance criteria:
- `fulcrum component status [<id>] [--agent ...] [--json]` reports installed state, surface targets, modified flag, and managed flag.
- `fulcrum doctor` includes a component lifecycle section with managed counts and parity reports per package component.
- `--json` output is parseable.

## Comments
- Shipped in `b0b163d feat(component): report managed lifecycle state`.
