---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/05-binary-entrypoint-and-compile.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, C4, C4 skills, C3]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Hand-written interactive flows for routing rules and skills conflict resolution, plus import wizard: `fulcrum routing rules edit <id>` (opens `$EDITOR` with YAML rule; saves on exit; parses with `yq`), `fulcrum skills conflicts resolve <slug>` (side-by-side diff in `less` pager; `k`=keep local / `u`=use upstream / `m`=`$EDITOR`; `--keep local|upstream` for non-interactive), `fulcrum import csv` column-mapping wizard (interactive table when `--map-columns` not provided). All three flows: `--non-interactive` mode exits `INTERACTIVE_REQUIRED` when TTY unavailable.

- **Web**: Routing rules editor at `/settings/routing`; Skills conflicts at `/settings/skills`; Import wizard at `/settings/connectors`.
- **CLI**: primary surface for these interactive flows.
- **TUI**: Routing rules CRUD and skills conflicts screen (Pillar 15 slices T15-57–T15-58) provide same functionality.

## Acceptance criteria

- [ ] `fulcrum routing rules edit <id>` with `EDITOR=cat`: YAML written to temp file; rule updated in DB after mock save.
- [ ] `fulcrum skills conflicts resolve <slug> --keep local`: local version preserved; `skills.lock.json` conflict cleared.
- [ ] `fulcrum skills conflicts resolve <slug> --keep upstream`: upstream version written to skill dir; lock cleared.
- [ ] `fulcrum import csv` without `--map-columns`: column-mapping prompts appear; selection stored in-memory; import runs.
- [ ] `--non-interactive` on all three flows: exits 7 when no TTY.
- [ ] Web routing editor, TUI routing screen, CLI `fulcrum routing rules edit` all reflect same routing rule state.

## Blocked by

- 14/issues/05-binary-entrypoint-and-compile.md

## Notes

P14.29–P14.30 maps to this slice (interactive routing + skills). CSV column wizard is part of P13.33 surface for CLI.
