# 23 — Agent cache and skill ownership

Status: ready-for-agent
Risk tier: medium
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` A6, A7
File ownership:
- `src/cli/repomix-package.ts`
- `src/cli/upstream-skills.ts`
- `src/cli/vendor-packages.ts`
- `src/cli/skills.ts`

Acceptance criteria:
- Before any top-level skill/command/cache write under `<agent>/skills/<name>` or `<agent>/commands/<name>`, the path is checked for an existing entry without a Fulcrum marker; pre-existing unowned content is backed up to `~/.fulcrum/state/global/backups/` with timestamp and skipped with a conflict report rather than overwritten.
- Removal honors the same marker — no removal of a skill/command without proof Fulcrum wrote it.
- Tests assert collision behavior across at least two agents.
