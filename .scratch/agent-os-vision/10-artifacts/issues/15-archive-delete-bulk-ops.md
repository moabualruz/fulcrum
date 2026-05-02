---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: [06-trpc-procedures.md, 09-web-list-and-scoped-routes.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q35, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Archive/unarchive/delete + bulk operations: Web bulk action bar + CLI flags + TUI confirm prompts

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Manual upload + preview + CRUD, archive/delete; acceptance criteria 3, 6, 7)

## What to build
Complete the archive/delete lifecycle across all three surfaces. Web: checkbox multi-select on `/artifacts` list + bulk action bar ("Archive selected", "Delete selected" with count badge); confirmation modal for bulk delete showing file names. CLI: `fulcrum artifacts archive <id>`, `unarchive <id>`, `delete <id> [--hard]`; all with `--json` confirmation response. TUI: `a` key archives selected artifact (confirm prompt showing filename); `D` deletes (confirm showing filename and size); supports multi-select with `Space` to toggle + `a`/`D` on selection. All surfaces show `archived` badge on archived artifacts.

## Acceptance criteria
- [ ] Schema migration: N/A — reads `archived` boolean from `0010_artifacts`.
- [ ] tRPC procedure / module: `artifacts.archive`, `artifacts.unarchive`, `artifacts.delete` all tested; bulk operation via multiple calls (no new bulk procedure needed for MVP).
- [ ] Web surface: bulk select + archive/delete action bar functional; confirmation modal shows names; archived artifacts show "Archived" badge in list; filter "Show archived" toggle works; Playwright: select 3 artifacts, bulk archive, verify badge.
- [ ] CLI command: `fulcrum artifacts archive <id> --json` returns `{ archived: true }`; `fulcrum artifacts delete <id> --json` returns `{ deleted: true }`; `fulcrum artifacts list --archived --json` shows archived artifacts.
- [ ] TUI screen: `a` with confirm prompt; `D` with filename+size confirm; `Space` to multi-select; bulk `a`/`D` on selection.
- [ ] Tests: archive → list excludes by default; `list --archived` includes; unarchive restores; delete soft → `archived=true`; delete `--hard` → row gone; bulk 3 artifacts archive all; RED→GREEN.

## Blocked by
- `06-trpc-procedures.md` — archive/unarchive/delete procedures.
- `09-web-list-and-scoped-routes.md` — list route must exist for bulk operations.

## Notes / Tech-stack hints
- Bulk Web operations: iterate array client-side calling tRPC per item; show progress toast; rollback on partial failure (undo toast).
- Q35: soft-delete default (`archived=true`); `--hard` sends `{ hard: true }` to `artifacts.delete` which physically removes from disk + DB row.
- `archived` filter: default `WHERE archived = false`; `--archived` flag includes archived.
- Sonic toasts for success/error feedback on all three surfaces where applicable.
