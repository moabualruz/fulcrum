# 10 — Compatibility wrappers for install and uninstall

Status: done
Risk tier: high
Dependencies: component-lifecycle-management/08, component-lifecycle-management/09
File ownership:
- `src/cli/install.ts`
- `src/cli/install.test.ts`
- `src/cli/uninstall.ts`
- `src/cli/uninstall.test.ts`

Acceptance criteria:
- `fulcrum install --dry-run` plans `profile.default` (or `profile.verify-all` with `--enable-all-mcps`) through the component planner.
- `--no-skills`, `--no-upstream-skills`, `--no-default-mcps` translate to planner exclusions.
- `fulcrum uninstall --dry-run` plans `profile.default` removal with `--purge`, `--keep-state`, `--include-caveman` honored by the executor.
- Existing flags remain stable.

## Comments
- Shipped in `2fc1882 refactor(component): route install through lifecycle engine` and `840b54e fix(component): support purge removal`.
