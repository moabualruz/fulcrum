# 01 — Marker-gate every Claude plugin install/uninstall

Status: ready-for-agent
Risk tier: high
Severity: critical
Source findings: A1, A3, A4
Dependencies: —
File ownership:
- `src/cli/install.ts`
- `src/cli/uninstall.ts`
- `src/cli/skills.ts`
- `src/cli/vendor-packages.ts`
- `src/cli/repomix-package.ts`
- `src/cli/upstream-skills.ts`
- `src/cli/install.test.ts`
- `src/cli/uninstall.test.ts`

Acceptance criteria:
- `claude plugin install ...` is invoked only when the user passes an explicit opt-in flag (default: `--with-claude-plugins`) **or** a Fulcrum ownership marker for that exact plugin already exists. Otherwise install prints the manual command and skips the CLI call.
- Every successful `claude plugin install` writes a per-plugin marker under `~/.fulcrum/state/global/claude-plugins/<plugin>.json` containing: plugin name, marketplace, source repo/ref, ISO timestamp, fulcrum version, source command.
- `claude plugin uninstall ...` is invoked only when the matching per-plugin marker exists. No marker → print the manual command and leave Claude state untouched.
- Broad cache/marketplace removals (`~/.claude/plugins/cache/<vendor>`, `~/.claude/plugins/marketplaces/<vendor>`) are scoped to subdirectories Fulcrum owns via marker. Unknown subdirectories are skipped with a manual-cleanup hint.
- New tests in `install.test.ts` / `uninstall.test.ts` cover: opt-in install path writes a marker; uninstall without marker prints manual command and does not call `claude plugin uninstall`; uninstall with marker invokes the CLI and removes the marker.
- `bun run ci` is green.

Notes:
- The marker schema lives in a single helper module (e.g. `src/cli/claude-plugin-markers.ts`) consumed by every install/uninstall path.
- Default `fulcrum install` becomes Claude-CLI-quiet; users opt in explicitly.
