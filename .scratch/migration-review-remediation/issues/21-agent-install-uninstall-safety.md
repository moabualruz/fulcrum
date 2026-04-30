# 21 — Agent install/uninstall safety (Claude account)

Status: ready-for-agent
Risk tier: high
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` A1, A4
File ownership:
- `src/cli/install.ts`
- `src/cli/uninstall.ts`
- `src/cli/skills.ts`
- `src/cli/upstream-skills.ts`
- `src/cli/vendor-packages.ts`
- `src/cli/repomix-package.ts`

Acceptance criteria:
- Every Claude plugin install path writes a per-plugin ownership marker before/with the install (plugin name, marketplace, operation, ISO timestamp). Suggested location: `~/.fulcrum/state/global/claude-plugin-markers/<marketplace>__<plugin>.json`.
- Every Claude plugin uninstall path checks for the marker; if absent, prints a manual command and skips.
- A new flag `--allow-claude-cli` (defaults off) gates first-time `claude plugin install` invocations from `fulcrum install` paths. Without the flag, install prints the manual command.
- `fulcrum uninstall` never fires `claude plugin uninstall` without the marker.
- Unit tests cover marker-present, marker-absent, and `--allow-claude-cli` paths.
