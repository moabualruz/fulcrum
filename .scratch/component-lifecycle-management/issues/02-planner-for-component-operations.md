# 02 — Planner for component operations

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/01
File ownership:
- `src/components/planner.ts`
- `src/components/planner.test.ts`
- `src/components/types.ts`

Acceptance criteria:
- `planComponentOperation` produces ordered actions for `profile.default` install.
- Agent-specific surfaces are limited to requested agents.
- Disable on a surface that does not support disable emits a `noop` action and a warning.
- Unknown component throws a clear error.

## Comments
- Shipped in `b858220 feat(component): add lifecycle foundation`. Verified by `bun test src/components/planner.test.ts`.
