---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: cli-codegen
Blocked-by: [14/issues/05-binary-entrypoint-and-compile.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-distribution, Q30, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Hand-written interactive flows in `src/cli/interactive/`: `fulcrum init` (seeds org + `admin@local` user; idempotent; no-prompt after first run), `fulcrum backup --output /path` (progress bar; destination path prompt if `--output` not set; exports PGlite dump + artifacts manifest tarball), `fulcrum restore --input /path` (confirmation prompt before overwrite; re-imports DB + re-links artifacts). `--non-interactive` flag exits `INTERACTIVE_REQUIRED` (exit 7) when TTY unavailable. Uses `@inquirer/prompts` (fallback: `prompts`).

- **Web**: `fulcrum init` creates the org + user that web UI first loads.
- **CLI**: primary surface for these flows.
- **TUI**: TUI Settings → Backups screen uses `backup.create` tRPC (same backing logic).

## Acceptance criteria

- [ ] `fulcrum init` exits 0; org + `admin@local` user row created in PGlite.
- [ ] `fulcrum init` run twice: second run exits 0; single org + user row (idempotent).
- [ ] `fulcrum backup --output /tmp/backup.tar.gz` exits 0; tarball created; contains PGlite dump + artifacts manifest.
- [ ] `fulcrum restore --input /tmp/backup.tar.gz` prompts "Restore will overwrite current data. Confirm? [y/N]"; `y` → DB restored; `n` → exits 0 with no change.
- [ ] `--non-interactive` flag: `fulcrum init --non-interactive` exits 7 if org exists prompt would appear.
- [ ] After `fulcrum init`, web loads without error; TUI launches without auth error.

## Blocked by

- 14/issues/05-binary-entrypoint-and-compile.md

## Notes

P14.25 + P14.31–P14.32 maps to this slice. `fulcrum web`, `fulcrum tui`, `fulcrum inference start/stop` entrypoints scaffolded in binary (05) but their full implementations are Pillars 16, 15, 2 respectively.
