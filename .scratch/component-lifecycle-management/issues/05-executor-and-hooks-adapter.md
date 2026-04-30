# 05 — Executor and hooks adapter

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/02, component-lifecycle-management/03
File ownership:
- `src/components/executor.ts`
- `src/components/executor.test.ts`
- `src/components/adapters/hooks.ts`
- `src/components/adapters/hooks.test.ts`

Acceptance criteria:
- `executeComponentPlan` records ledger operation rows and dispatches to adapters.
- `--dry-run` skips writes and never runs vendor CLIs.
- Hooks adapter installs/removes/enables/disables hook registrations through existing helpers.
- Errors mark the operation step as failed and bubble up.

## Comments
- Shipped via `b858220 feat(component): add lifecycle foundation` and follow-ups. Verified by `bun test src/components/executor.test.ts src/components/adapters/hooks.test.ts`.
