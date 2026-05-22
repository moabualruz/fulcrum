<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
  } from "@fulcrum/ui-kit";
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

<Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
  <SheetContent
    data-board-sheet
    data-testid="task-detail-panel"
    data-state={open ? "open" : "closed"}
    aria-hidden={!open}
    side="right"
    class="w-96 p-0 sm:max-w-md"
    portalProps={{ disabled: true }}
    showCloseButton={false}
  >
    {#if task}
      <SheetHeader class="flex-row items-center justify-between border-b border-border">
        <SheetTitle data-testid="task-detail-title">{task.title}</SheetTitle>
        <Button type="button" data-board-sheet-close aria-label="close" onclick={() => onClose?.()} variant="ghost" size="sm" class="size-8 px-0">×</Button>
      </SheetHeader>

      <form data-board-sheet-form onsubmit={submit} class="space-y-3 px-4">
      <label class="block text-sm">
        Title
        <Input data-board-sheet-title bind:value={title} required minlength="1" maxlength="200" class="mt-1" />
      </label>

      <label class="block text-sm">
        Status
        <Select bind:value={status} type="single">
          <SelectTrigger data-board-sheet-status data-testid="task-detail-status" aria-label="Task status" class="mt-1">
            <SelectValue placeholder={describeStatus(status)} />
          </SelectTrigger>
          <SelectContent>
            {#each TASK_STATUSES as s (s)}
              <SelectItem value={s} label={describeStatus(s)} />
            {/each}
          </SelectContent>
        </Select>
      </label>

      <label class="block text-sm">
        Priority
        <Input data-board-sheet-priority type="number" bind:value={priority} min="0" max="20" class="mt-1" />
      </label>

      <label class="block text-sm">
        Description
        <div data-board-sheet-description data-testid="task-detail-description" class="mt-1 w-full rounded border border-border bg-background p-0">
          <TaskDescriptionEditor
            taskId={task.id}
            content={tiptapContent}
            save={async (_taskId, content) => {
              tiptapContent = content;
            }}
          />
        </div>
      </label>

      <SheetFooter class="flex-row px-0 py-0">
        <Button type="submit" data-board-sheet-save variant="primary">Save</Button>
        <Button type="button" data-board-sheet-run onclick={() => onRun?.(task.id)} variant="secondary">Run</Button>
        <Button type="button" data-board-sheet-delete onclick={() => onDelete?.(task.id)} variant="danger">Delete</Button>
      </SheetFooter>
    </form>

    <section class="border-t border-border px-4 pt-4">
      <Button type="button" data-testid="tab-comments" variant="ghost" class="mb-3 px-0 text-sm font-medium">Comments</Button>
      <div data-testid="comment-list" class="min-h-6 space-y-2">
        {#each comments as comment}
          <div data-testid="comment-item" class="rounded border border-border px-3 py-2 text-sm">{comment}</div>
        {/each}
      </div>
      <form class="mt-3 flex gap-2" onsubmit={submitComment}>
        <Input
          data-testid="comment-input"
          bind:value={commentDraft}
          aria-label="Comment"
        />
        <Button type="submit" data-testid="comment-submit" variant="secondary">Add</Button>
      </form>
    </section>
    {/if}
  </SheetContent>
</Sheet>
