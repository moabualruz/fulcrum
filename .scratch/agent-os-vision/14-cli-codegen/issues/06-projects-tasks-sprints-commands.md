---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/05-binary-entrypoint-and-compile.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Integration tests for the generated project, task, and sprint domain commands. Each test calls the binary in-process (via `bun:test` spawning `dist/fulcrum`) or via `createCaller` and asserts typed JSON output. Covers: `fulcrum projects list --json`, `fulcrum tasks create --title T --project P --json`, `fulcrum tasks list --status open --assignee me --json`, `fulcrum tasks update <id> --status done --json`, `fulcrum tasks bulk <ids> --status done --json`, `fulcrum tasks move <id> --sprint S --json`, `fulcrum sprints list --json`, `fulcrum sprints activate <id> --json`, `fulcrum sprints complete <id> --json`, `fulcrum custom-fields list --project P --json`, `fulcrum saved-views list --project P --json`.

- **Web**: same data visible in web UI task board/list after CLI mutation.
- **CLI**: primary surface for this slice.
- **TUI**: same tasks/sprints visible in TUI board after CLI mutation.

## Acceptance criteria

- [ ] `fulcrum projects list --json` → `Project[]` Zod shape; empty org → `[]`; `--limit` respected.
- [ ] `fulcrum tasks create --title T --project P --json` → task created; returned `{ id, title, status: 'open' }`.
- [ ] `fulcrum tasks list --status open --assignee me --json` → filters applied; shape correct.
- [ ] `fulcrum tasks update <id> --status done --json` → task status updated; events row inserted.
- [ ] `fulcrum sprints activate <id> --json` → sprint `status='active'`; error on already-active sprint.
- [ ] `fulcrum sprints complete <id> --json` → sprint `status='completed'`; velocity rollup triggered.
- [ ] After CLI `tasks create`, web UI shows new task; TUI task list shows it.

## Blocked by

- 14/issues/05-binary-entrypoint-and-compile.md

## Notes

P14.12–P14.16 maps to this slice.
