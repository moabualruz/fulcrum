# 05 — Interactive kanban board

Status: ready-for-agent
Risk tier: high
Severity: critical
Dependencies: 02
File ownership:
- `src/web/src/routes/boards/**`
- `src/web/src/lib/components/board/**`
- `src/web/src/lib/server/tasks.ts`

TDD plan:
- RED unit: `tasks.test.ts` server actions: `createTaskAction`, `updateTaskAction`, `deleteTaskAction`, `moveTaskStatusAction` against PGlite. Each asserts the row + the matching `task.<verb>` event.
- RED unit: `board-helpers.test.ts` covers `groupTasksByStatus` (already exists; tighten ordering), `keyboardMove(state, key)` for the accessibility keyboard re-order, and `optimisticMove(tasks, taskId, toStatus)`.
- RED component: `board-card.svelte.test.ts` renders a card, clicks it, asserts the parent's open-edit-sheet handler was called.
- RED component: `board-column.svelte.test.ts` enters text into "+ Add" input, presses Enter, asserts `enhance` action called with the correct `formData`.
- RED component: `board-keyboard.svelte.test.ts` simulates Cmd+Right on a focused card, asserts `optimisticMove` produced expected state, confirms `aria-live` region updated.
- GREEN: implement the dnd-action wrapper, server actions, sheet edit, inline create.
- REFACTOR: extract `<BoardSheet />` reused for click-to-edit.

Acceptance criteria:
- `/boards` shows a five-column board (`pending`, `in_progress`, `blocked`, `completed`, `cancelled`) using `svelte-dnd-action`.
- Drag a card across columns → server action updates `tasks.status` + writes a `task.status_changed` event. Optimistic UI revert on failure.
- Each card click opens a right-side `Sheet` for edit (title, description, priority, status select). Save updates row + writes event.
- Inline create-card per column (`+ Add` button → input + Enter to commit).
- Delete from sheet (`AlertDialog`).
- Keyboard: `Tab` focuses cards; `Up`/`Down` reorders inside column; `Cmd+Left`/`Cmd+Right` moves card to neighbor column. Announces moves via `aria-live`.
- Filters by project + assignee (assignee column unused today, hide if null everywhere).
- Toasts on every mutation.
