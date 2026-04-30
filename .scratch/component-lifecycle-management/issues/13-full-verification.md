# 13 — Full verification

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/01..12
File ownership: —

Acceptance criteria:
- Component-focused suite passes (`bun test src/components/...` and `src/cli/component.test.ts`).
- Affected legacy suites pass (install/uninstall/hooks/mcp-registry/mcp-cmd/skills/upstream-skills/vendor-packages/repomix-package/doctor).
- `bun run ci` is green across all six stages.
- Dry-run smokes succeed for `component list`, default profile plan, hook install, install wrapper, uninstall wrapper.

## Comments
- Verified at `7beec0b fix(component): satisfy lifecycle verification` and `ab22d30 docs(handover): record lifecycle merge cleanup`. Final 2026-04-30 CI gate confirmed all six stages green.
