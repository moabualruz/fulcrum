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

## Sub-tasks

- [x] **05.1 — Server actions for tasks.** Owns: `src/web/src/lib/server/tasks.ts`, `.test.ts`. RED: PGlite tests for create/update/delete/moveStatus + matching `task.<verb>` event rows.
- [x] **05.2 — Board helpers (`optimisticMove`, `keyboardMove`).** Owns: `src/web/src/lib/components/board/board-helpers.ts`, `.test.ts`. RED: optimistic move keeps order stable in same column; cross-column move appends to end of target.
- [ ] **05.3 — `BoardCard` component.** Owns: `src/web/src/lib/components/board/BoardCard.svelte`, `.svelte.test.ts`. RED: click fires `onEdit` callback with task id.
- [ ] **05.4 — `BoardColumn` with `svelte-dnd-action`.** Owns: `src/web/src/lib/components/board/BoardColumn.svelte`, `.svelte.test.ts`. RED: `finalize` handler emits server-action call with `{ taskId, fromStatus, toStatus }`.
- [ ] **05.5 — `BoardSheet` editor + keyboard accessibility.** Owns: `src/web/src/lib/components/board/BoardSheet.svelte`, `KeyboardMoveAnnouncer.svelte`. RED: keyboard helper triggers `optimisticMove`; `aria-live` region updated with move description.
- [ ] **05.6 — `/boards/+page` wiring + project filter.** Owns: `src/web/src/routes/boards/+page.server.ts`, `+page.svelte`. RED: page renders five columns with seeded counts; project filter narrows results.

## Comments

### 05.1 — landed

Server actions module `src/web/src/lib/server/tasks.ts` (139 LOC) with 12 PGlite tests covering create/update/delete/moveStatus and matching `task.<verb>` event rows.

- `createTaskAction` reuses `kernel.createTask`; `task.created` emitted by the kernel with `{title,status}`.
- `updateTaskAction` builds a dynamic `UPDATE`, validates `status` against `TASK_STATUSES`, and emits `task.updated` with `payload.changed`.
- `deleteTaskAction` uses `DELETE ... RETURNING org_id, project_id`; emits `task.deleted` only when a row is actually removed. No `events` strip required (events.subject_id has no FK to tasks).
- `moveTaskStatusAction` guards the transition with `WHERE id=$2 AND status=$3` so a stale optimistic UI throws `status conflict: task <id> not in <from>` and the caller can revert. Emits `task.status_changed` with `{from,to,task}`.

Gates: `bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9.

### 05.2 — landed

Pure board helpers in `src/web/src/lib/components/board/board-helpers.ts` (115 LOC) with 18 unit tests in `board-helpers.test.ts`.

- `BoardSnapshot` keeps tasks grouped by `TaskStatus` across the five canonical columns; `buildBoardSnapshot` ignores rows with unknown statuses and sorts each column priority DESC, `updated_at` DESC, id ASC (matches `listBoardTasks` SQL order).
- `optimisticMove(snapshot, taskId, toStatus)` returns a new snapshot with the moved card appended to the END of the target column. Same-column move and unknown-task lookups return identity (`next === snapshot`); same-column reports `from = currentStatus`, unknown returns `from = null`.
- `keyboardMove`: `ArrowUp`/`ArrowDown` without modifier swap with the column neighbour; `Cmd/Ctrl+ArrowLeft`/`ArrowRight` walks `TASK_STATUSES` to the neighbour column. Bare arrows on left/right are no-ops. ARIA description is `"Moved '<title>' from <fromLabel> to <toLabel>."` for column moves; `null` for no-ops.
- `describeStatus` exports human labels (`"In progress"`, `"Pending"`, …) reused by both intra-column reorder announcements and cross-column moves.

Gates: `bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9. (Pre-existing 31 component-test failures from earlier sub-tasks are unchanged — none introduced by 05.2.)
