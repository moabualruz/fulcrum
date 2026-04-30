# 04 — `fulcrum component` CLI: list, info, plan

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/01, component-lifecycle-management/02
File ownership:
- `src/cli/component.ts`
- `src/cli/component.test.ts`
- `src/index.ts`

Acceptance criteria:
- `fulcrum component list [--json]` enumerates catalog entries with id, kind, description, defaultProfile flag.
- `fulcrum component info <id> [--json]` returns the component spec.
- `fulcrum component plan <op> <target> [--agent ...] [--all-agents] [--json]` calls the planner and renders actions/warnings.

## Comments
- Shipped in `b858220 feat(component): add lifecycle foundation`. Verified by `bun test src/cli/component.test.ts`.
