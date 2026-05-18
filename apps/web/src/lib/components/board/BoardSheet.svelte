<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";
  import type { TaskStatus } from "$lib/server/tasks";
  import TaskDescriptionEditor from "$lib/components/tasks/TaskDescriptionEditor.svelte";
  import type { JSONContent } from "@tiptap/core";
  import { textToTipTapDoc } from "$lib/components/tasks/task-description";
  import { TASK_STATUSES, describeStatus } from "./board-helpers.ts";

  interface Props {
    open: boolean;
    task: BoardTask | null;
    onSave?: (input: { id: string; title: string; status: TaskStatus; priority: number; description: string | null }) => void;
    onDelete?: (id: string) => void;
    onRun?: (taskId: string) => void;
    onClose?: () => void;
  }

  const { open, task, onSave, onDelete, onRun, onClose }: Props = $props();

  const isStatus = (s: string): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s);
  const fieldCls = "mt-1 w-full rounded border border-border bg-background p-2";

  // Seed from `task` so SSR renders populated controls; `$effect` resyncs on swap.
  /* svelte-ignore state_referenced_locally */
  let title = $state(task?.title ?? "");
  /* svelte-ignore state_referenced_locally */
  let status = $state<TaskStatus>(task && isStatus(task.status) ? task.status : "pending");
  /* svelte-ignore state_referenced_locally */
  let priority = $state(task?.priority ?? 0);
  /* svelte-ignore state_referenced_locally */
  let description = $state(task?.description_text ?? "");
  /* svelte-ignore state_referenced_locally */
  let tiptapContent = $state<JSONContent>((task?.tiptap_content as JSONContent | undefined) ?? textToTipTapDoc(task?.description_text ?? ""));
  /* svelte-ignore state_referenced_locally */
  let syncedId = $state(task?.id ?? null);
  let comments = $state<string[]>([]);
  let commentDraft = $state("");

  $effect(() => {
    if (task && task.id !== syncedId) {
      title = task.title;
      status = isStatus(task.status) ? task.status : "pending";
      priority = task.priority;
      description = task.description_text ?? "";
      tiptapContent = (task.tiptap_content as JSONContent | undefined) ?? textToTipTapDoc(description);
      syncedId = task.id;
      comments = [];
      commentDraft = "";
    } else if (!task && syncedId !== null) {
      syncedId = null;
      comments = [];
      commentDraft = "";
    }
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!task) return;
    onSave?.({ id: task.id, title, status, priority, description: description.length === 0 ? null : description });
  }

  function submitComment(event: SubmitEvent): void {
    event.preventDefault();
    const body = commentDraft.trim();
    if (body.length === 0) return;
    comments = [...comments, body];
    commentDraft = "";
  }
</script>

<aside
  data-board-sheet
  data-testid="task-detail-panel"
  data-state={open ? "open" : "closed"}
  aria-hidden={!open}
  class={cn("fixed inset-y-0 right-0 w-96 border-l border-border bg-background p-6 transition-transform", open ? "translate-x-0" : "translate-x-full")}
>
  {#if task}
    <header class="mb-4 flex items-center justify-between">
      <h2 data-testid="task-detail-title" class="text-lg font-semibold">{task.title}</h2>
      <button type="button" data-board-sheet-close aria-label="close" onclick={() => onClose?.()} class="text-muted-foreground hover:text-foreground">×</button>
    </header>

    <form data-board-sheet-form onsubmit={submit} class="space-y-3">
      <label class="block text-sm">
        Title
        <input data-board-sheet-title bind:value={title} required minlength="1" maxlength="200" class={fieldCls} />
      </label>

      <label class="block text-sm">
        Status
        <select data-board-sheet-status data-testid="task-detail-status" bind:value={status} class={fieldCls}>
          {#each TASK_STATUSES as s (s)}<option value={s}>{describeStatus(s)}</option>{/each}
        </select>
      </label>

      <label class="block text-sm">
        Priority
        <input data-board-sheet-priority type="number" bind:value={priority} min="0" max="20" class={fieldCls} />
      </label>

      <label class="block text-sm">
        Description
        <div data-board-sheet-description data-testid="task-detail-description" class={cn(fieldCls, "p-0")}>
          <TaskDescriptionEditor
            taskId={task.id}
            content={tiptapContent}
            save={async (_taskId, content) => {
              tiptapContent = content;
            }}
          />
        </div>
      </label>

      <div class="flex items-center gap-2">
        <button type="submit" data-board-sheet-save class={cn(buttonVariants({ variant: "default" }))}>Save</button>
        <button type="button" data-board-sheet-run onclick={() => onRun?.(task.id)} class={cn(buttonVariants({ variant: "outline" }))}>Run</button>
        <button type="button" data-board-sheet-delete onclick={() => onDelete?.(task.id)} class={cn(buttonVariants({ variant: "destructive" }))}>Delete</button>
      </div>
    </form>

    <section class="mt-5 border-t border-border pt-4">
      <button type="button" data-testid="tab-comments" class="mb-3 text-sm font-medium">Comments</button>
      <div data-testid="comment-list" class="min-h-6 space-y-2">
        {#each comments as comment}
          <div data-testid="comment-item" class="rounded border border-border px-3 py-2 text-sm">{comment}</div>
        {/each}
      </div>
      <form class="mt-3 flex gap-2" onsubmit={submitComment}>
        <input
          data-testid="comment-input"
          bind:value={commentDraft}
          class={cn(fieldCls, "mt-0")}
          aria-label="Comment"
        />
        <button type="submit" data-testid="comment-submit" class={cn(buttonVariants({ variant: "outline" }))}>Add</button>
      </form>
    </section>
  {/if}
</aside>
