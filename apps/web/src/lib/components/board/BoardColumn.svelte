<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import type { TaskStatus } from "$lib/server/tasks";
  import { cn } from "@fulcrum/ui-kit";
  import BoardCard from "./BoardCard.svelte";
  import {
    diffMoveFromBoard,
    type DndConsiderEvent,
    type DndFinalizeEvent,
    type DndMovePayload,
  } from "./board-column-handlers.ts";
  import { commitNewCardTitle } from "./board-column-create.ts";

  interface Props {
    status: TaskStatus;
    label: string;
    tasks: BoardTask[];
    allTasks: BoardTask[];
    onCardEdit?: (taskId: string) => void;
    onMove?: (move: DndMovePayload) => void;
    onCreate?: (title: string) => void;
  }

  const { status, label, tasks, allTasks, onCardEdit, onMove, onCreate }: Props = $props();

  // svelte-dnd-action mutates `items` in place on consider/finalize, so we
  // keep an internal mutable copy that resyncs whenever the prop changes.
  // svelte-ignore state_referenced_locally
  let columnTasks = $state<BoardTask[]>(tasks.slice());
  $effect(() => {
    columnTasks = tasks.slice();
  });
  let draft = $state("");

  // dndzone is browser-only; load lazily so SSR + tests skip it cleanly.
  type DndAction = (
    node: HTMLElement,
    options: { items: BoardTask[]; type: string; flipDurationMs?: number },
  ) => { update?: (o: unknown) => void; destroy?: () => void };
  let dndzone = $state<DndAction | null>(null);
  if (typeof window !== "undefined") {
    void import("svelte-dnd-action").then((m) => {
      dndzone = m.dndzone as DndAction;
    });
  }

  function onConsider(event: DndConsiderEvent) {
    columnTasks = event.detail.items;
  }
  function onFinalize(event: DndFinalizeEvent) {
    const move = diffMoveFromBoard(allTasks, event.detail.items, status);
    columnTasks = event.detail.items;
    if (move) onMove?.(move);
  }
  function submitNew(event: SubmitEvent) {
    event.preventDefault();
    const title = commitNewCardTitle(draft);
    if (title === null) return;
    onCreate?.(title);
    draft = "";
  }
</script>

<section
  data-board-column={status}
  data-testid="kanban-column"
  data-status={status}
  class={cn("flex min-w-[16rem] flex-col gap-2 rounded-md border border-border bg-muted/30 p-2")}
>
  <header data-board-column-header class="flex items-center justify-between">
    <h2 class="text-sm font-semibold">{label}</h2>
    <span data-board-column-count class="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
      >{columnTasks.length}</span
    >
  </header>

  {#if dndzone}
    <ul
      data-board-column-list
      class="flex flex-col gap-2"
      use:dndzone={{ items: columnTasks, type: "task", flipDurationMs: 150 }}
      {...({ onconsider: onConsider, onfinalize: onFinalize } as Record<string, unknown>)}
      aria-label={`${label} column`}
    >
      {#each columnTasks as task (task.id)}
        <li><BoardCard {task} onEdit={onCardEdit} /></li>
      {/each}
    </ul>
  {:else}
    <ul data-board-column-list class="flex flex-col gap-2" aria-label={`${label} column`}>
      {#each columnTasks as task (task.id)}
        <li><BoardCard {task} onEdit={onCardEdit} draggable={false} /></li>
      {/each}
    </ul>
  {/if}

  <form data-board-column-add class="mt-1 flex gap-2" onsubmit={submitNew}>
    <input
      data-board-column-input
      type="text"
      bind:value={draft}
      placeholder="+ Add task"
      class="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
      aria-label={`Add task to ${label}`}
    />
    <button
      type="submit"
      data-board-column-submit
      class="rounded border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={`Add task to ${label}`}
    >
      Add
    </button>
  </form>
</section>
