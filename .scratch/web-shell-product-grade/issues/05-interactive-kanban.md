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
- [x] **05.3 — `BoardCard` component.** Owns: `src/web/src/lib/components/board/BoardCard.svelte`, `.svelte.test.ts`. RED: click fires `onEdit` callback with task id.
- [x] **05.4 — `BoardColumn` with `svelte-dnd-action`.** Owns: `src/web/src/lib/components/board/BoardColumn.svelte`, `.svelte.test.ts`. RED: `finalize` handler emits server-action call with `{ taskId, fromStatus, toStatus }`.
- [x] **05.5 — `BoardSheet` editor + keyboard accessibility.** Owns: `src/web/src/lib/components/board/BoardSheet.svelte`, `KeyboardMoveAnnouncer.svelte`. RED: keyboard helper triggers `optimisticMove`; `aria-live` region updated with move description.
- [ ] **05.6 — `/boards/+page` wiring + project filter.** Owns: `src/web/src/routes/boards/+page.server.ts`, `+page.svelte`. RED: page renders five columns with seeded counts; project filter narrows results.

## Comments

### 05.1 — landed

Server actions module `src/web/src/lib/server/tasks.ts` (139 LOC) with 12 PGlite tests covering create/update/delete/moveStatus and matching `task.<verb>` event rows.

- `createTaskAction` reuses `kernel.createTask`; `task.created` emitted by the kernel with `{title,status}`.
- `updateTaskAction` builds a dynamic `UPDATE`, validates `status` against `TASK_STATUSES`, and emits `task.updated` with `payload.changed`.
- `deleteTaskAction` uses `DELETE ... RETURNING org_id, project_id`; emits `task.deleted` only when a row is actually removed. No `events` strip required (events.subject_id has no FK to tasks).
- `moveTaskStatusAction` guards the transition with `WHERE id=$2 AND status=$3` so a stale optimistic UI throws `status conflict: task <id> not in <from>` and the caller can revert. Emits `task.status_changed` with `{from,to,task}`.

Gates: `bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9.

### 05.4 — landed

`BoardColumn.svelte` (106 LOC) wraps the per-status column. Header carries `data-board-column-header` with `<h2>` label + `data-board-column-count` badge. The `<ul data-board-column-list>` uses `svelte-dnd-action`'s `dndzone` action when `window` is defined and falls back to a plain SSR `<ul>` (with `draggable={false}` cards) so `svelte/server` `render()` works without loading the browser-only library. Inline-add `<form data-board-column-add>` holds an `<input data-board-column-input>` bound to a `$state("")` draft; submit calls `commitNewCardTitle` and forwards trimmed titles via `onCreate`.

`board-column-handlers.ts` (49 LOC) ships `diffMoveFromBoard(allBefore, columnAfter, toStatus)` — builds an id→prior map from the whole board, walks `columnAfter`, picks tasks whose prior `status !== toStatus`, sorts the candidates by id ASC, and returns the first as `{taskId, fromStatus, toStatus}` (or `null`). Tested: cross-column move, all-already-in-target null, empty column null, multi-diff deterministic id, unknown task defensive null.

`board-column-create.ts` exports `commitNewCardTitle(raw)` — trims, returns `null` for empty/whitespace-only, raw trimmed string otherwise. Tested: 4 cases (empty, whitespace, plain, padded).

`svelte-dnd-action@0.9.69` added; `bunfig.toml [install].frozenLockfile` toggled to `false` for the install then restored to `true`.

RED: `bun test --conditions=svelte ./src/web/src/lib/components/board/board-column-handlers.test.ts ./src/web/src/lib/components/board/board-column-create.test.ts ./src/web/src/lib/components/board/BoardColumn.svelte.test.ts` → `0 pass / 3 fail / 2 errors` (`Cannot find module './board-column-handlers.ts'`, `Cannot find module './board-column-create.ts'`, `Cannot find module './BoardColumn.svelte'`).

GREEN: same command → `12 pass / 0 fail`. Full board suite `./src/web/src/lib/components/board` → `37 pass / 0 fail`.

Gates: `cd src/web && bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9.

### 05.2 — landed

Pure board helpers in `src/web/src/lib/components/board/board-helpers.ts` (115 LOC) with 18 unit tests in `board-helpers.test.ts`.

- `BoardSnapshot` keeps tasks grouped by `TaskStatus` across the five canonical columns; `buildBoardSnapshot` ignores rows with unknown statuses and sorts each column priority DESC, `updated_at` DESC, id ASC (matches `listBoardTasks` SQL order).
- `optimisticMove(snapshot, taskId, toStatus)` returns a new snapshot with the moved card appended to the END of the target column. Same-column move and unknown-task lookups return identity (`next === snapshot`); same-column reports `from = currentStatus`, unknown returns `from = null`.
- `keyboardMove`: `ArrowUp`/`ArrowDown` without modifier swap with the column neighbour; `Cmd/Ctrl+ArrowLeft`/`ArrowRight` walks `TASK_STATUSES` to the neighbour column. Bare arrows on left/right are no-ops. ARIA description is `"Moved '<title>' from <fromLabel> to <toLabel>."` for column moves; `null` for no-ops.
- `describeStatus` exports human labels (`"In progress"`, `"Pending"`, …) reused by both intra-column reorder announcements and cross-column moves.

Gates: `bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9. (Pre-existing 31 component-test failures from earlier sub-tasks are unchanged — none introduced by 05.2.)

### 05.5 — landed

`BoardSheet.svelte` (92 LOC) is the right-side editor panel. The shell renders an `<aside data-board-sheet>` with `data-state="open"|"closed"` and `aria-hidden` mirrored to `!open`, sliding in/out via a `translate-x-*` class. When `task` is null the form is omitted entirely (the SSR contract the test asserts). When `task` is provided, four inputs hang off `data-board-sheet-{title,status,priority,description}` plus Save/Delete buttons (`data-board-sheet-{save,delete}`) styled via `buttonVariants({variant})`. A close button carries `aria-label="close"` and `data-board-sheet-close`.

Local `$state` (title/status/priority/description/syncedId) is seeded from the initial `task` prop so SSR renders populated controls; a `$effect` resyncs whenever `task.id` changes (and clears `syncedId` on close), so subsequent in-place edits are not stomped by re-renders. `submit` calls `onSave({ id, title, status, priority, description: description || null })`; the delete button calls `onDelete(task.id)`. `state_referenced_locally` warnings are silenced with `/* svelte-ignore */` because reading `task` once at init is intentional.

`KeyboardMoveAnnouncer.svelte` (9 LOC) is a tiny `<div data-keyboard-announcer aria-live="polite" aria-atomic="true" class="sr-only">` that prints `message ?? ""` (no `{#if}` block, so SSR never emits Svelte block-comment markers — the test asserts the inner HTML is exactly empty when `message=null`).

Tests:
- `KeyboardMoveAnnouncer.svelte.test.ts` (2 SSR cases): empty wrapper when `message=null`, exact-string render when message provided.
- `BoardSheet.svelte.test.ts` (5 SSR cases): closed shell with no form when task null; open form with all `data-*` hooks; title input value reflects task; status select marks the task's status as `selected`; close button carries `aria-label="close"` plus its data hook.

RED: `bun test --conditions=svelte ./src/web/src/lib/components/board/BoardSheet.svelte.test.ts ./src/web/src/lib/components/board/KeyboardMoveAnnouncer.svelte.test.ts` → `0 pass / 2 fail` (`Cannot find module './BoardSheet.svelte'` and `Cannot find module './KeyboardMoveAnnouncer.svelte'`).

GREEN: same command → `7 pass / 0 fail`. Full board suite `./src/web/src/lib/components/board/` → `44 pass / 0 fail`.

Gates: `cd src/web && bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9 green.

### 05.3 — landed

`BoardCard.svelte` (35 LOC) renders a flat shadcn-shape `<button data-board-card>` exposing `data-task-id`, `data-status`, `data-priority`, `data-draggable`, and `aria-label="Edit task: <title>"`. Inner spans carry `data-board-card-title`, `data-board-card-priority` (rendered as `P<priority>`), and an optional `data-board-card-project` marker (only when `task.project_id` is set). No dnd integration — that lives in 05.4.

Click fan-out lives in `board-card-handlers.ts` (`makeBoardCardClick(taskId, onEdit?)`, 5 LOC) so the callback wiring is unit-testable without booting the DOM.

Tests:
- `BoardCard.svelte.test.ts` (4 SSR cases): data-attribute hooks + aria-label, title slot, priority slot, project marker presence/absence.
- `board-card-handlers.test.ts` (3 cases): fires `onEdit(taskId)` once, no-op when `onEdit` undefined, multi-click counts.

Gates: `bun run check` 0/0/0; `bun run build` ok; repo `bun run ci` 9/9.
