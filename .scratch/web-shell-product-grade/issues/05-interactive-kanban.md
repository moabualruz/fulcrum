# 05 — Interactive kanban board

Status: ready-for-agent
Risk tier: high
Severity: critical
Dependencies: 02
File ownership:
- `src/web/src/routes/boards/**`
- `src/web/src/lib/components/board/**`
- `src/web/src/lib/server/tasks.ts`

Acceptance criteria:
- `/boards` shows a five-column board (`pending`, `in_progress`, `blocked`, `completed`, `cancelled`) using `svelte-dnd-action`.
- Drag a card across columns → server action updates `tasks.status` + writes a `task.status_changed` event. Optimistic UI revert on failure.
- Each card click opens a right-side `Sheet` for edit (title, description, priority, status select). Save updates row + writes event.
- Inline create-card per column (`+ Add` button → input + Enter to commit).
- Delete from sheet (`AlertDialog`).
- Keyboard: `Tab` focuses cards; `Up`/`Down` reorders inside column; `Cmd+Left`/`Cmd+Right` moves card to neighbor column. Announces moves via `aria-live`.
- Filters by project + assignee (assignee column unused today, hide if null everywhere).
- Toasts on every mutation.
