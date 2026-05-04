<script lang="ts">
  import type { TaskDetailPayload, SubtaskRow, EdgeRow, EventRow } from "$lib/server/task-detail";
  import type { TaskStatus } from "$lib/server/tasks";
  import { TASK_STATUSES, describeStatus } from "$lib/components/board/board-helpers";
  import { matchTaskShortcut } from "$lib/components/task-detail/task-detail-helpers";
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils.js";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";

  interface Props {
    data: {
      streamed: { data: Promise<TaskDetailPayload> | TaskDetailPayload };
    };
  }
  const { data }: Props = $props();

  const isStatus = (s: string): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s);
  const fieldCls = "mt-1 w-full rounded border border-border bg-background p-2";

  let payload = $state<TaskDetailPayload | null>(null);
  let editingTitle = $state(false);
  let activeOverlay = $state<string | null>(null);
  let autosaveStatus = $state<"idle" | "saving" | "saved" | "error">("idle");

  // Sync from streamed
  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) payload = d;
  }
  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      let cancelled = false;
      void d.then((p) => { if (!cancelled) payload = p; });
      return () => { cancelled = true; };
    } else {
      payload = d;
    }
  });

  // Edit state seeded from payload
  let title = $derived(payload?.task.title ?? "");
  let status = $derived(payload?.task.status ?? "pending");
  let priority = $derived(payload?.task.priority ?? 0);
  let description = $derived(payload?.task.description ?? "");

  // Autosave debounce
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  function onDescriptionInput(value: string): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveStatus = "idle";
    autosaveTimer = setTimeout(async () => {
      autosaveStatus = "saving";
      try {
        const fd = new FormData();
        fd.set("description", value);
        await fetch("?/autosave", { method: "POST", body: fd });
        autosaveStatus = "saved";
      } catch {
        autosaveStatus = "error";
      }
    }, 1000);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      activeOverlay = null;
      editingTitle = false;
      return;
    }
    const match = matchTaskShortcut(event);
    if (!match) return;
    event.preventDefault();
    if (match.action === "edit-title") editingTitle = true;
    else activeOverlay = match.action;
  }

  async function postForm(action: string, fields: Record<string, string>): Promise<Response> {
    const fd = new FormData();
    for (const [k, val] of Object.entries(fields)) fd.set(k, val);
    const res = await fetch(`?/${action}`, { method: "POST", body: fd });
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.invalidateAll();
    }
    return res;
  }

  async function onSave(): Promise<void> {
    if (!payload) return;
    await postForm("update", {
      title,
      status,
      priority: String(priority),
      description: description || "",
    });
  }

  async function onDelete(): Promise<void> {
    if (!payload) return;
    await postForm("delete", {});
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.goto("/boards");
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then _resolved}
  {#if payload}
    <article data-task-detail class="mx-auto max-w-3xl p-6">
      <!-- Header -->
      <header class="mb-6">
        {#if editingTitle}
          <input
            data-task-title-input
            value={title}
            oninput={(e) => { /* title edit handled via form submit */ }}
            onblur={() => (editingTitle = false)}
            class="text-2xl font-bold w-full border-b border-border bg-transparent outline-none"
          />
        {:else}
          <h1
            data-task-title
            class="text-2xl font-bold cursor-pointer hover:text-muted-foreground"
            onclick={() => (editingTitle = true)}
            role="button"
            tabindex="0"
          >{payload.task.title}</h1>
        {/if}
        <div class="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span data-task-status>{describeStatus(payload.task.status)}</span>
          <span>·</span>
          <span data-task-priority>P{payload.task.priority}</span>
          <span>·</span>
          <span data-task-updated>Updated {payload.task.updated_at}</span>
        </div>
      </header>

      <!-- Description with autosave -->
      <section data-task-description class="mb-6">
        <h2 class="text-sm font-semibold text-muted-foreground mb-1">Description</h2>
        <textarea
          data-task-description-input
          value={description}
          oninput={(e) => onDescriptionInput((e.target as HTMLTextAreaElement).value)}
          class={cn(fieldCls, "min-h-32")}
          placeholder="Add a description..."
        ></textarea>
        {#if autosaveStatus === "saving"}
          <span data-autosave-indicator class="text-xs text-muted-foreground">Saving...</span>
        {:else if autosaveStatus === "saved"}
          <span data-autosave-indicator class="text-xs text-green-600">Saved</span>
        {:else if autosaveStatus === "error"}
          <span data-autosave-indicator class="text-xs text-red-600">Error saving</span>
        {/if}
      </section>

      <!-- Subtasks -->
      {#if payload.subtasks.length > 0}
        <section data-task-subtasks class="mb-6">
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">Subtasks ({payload.subtasks.length})</h2>
          <ul class="space-y-1">
            {#each payload.subtasks as sub (sub.id)}
              <li data-subtask-item class="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm">
                <span class="text-muted-foreground">{describeStatus(sub.status)}</span>
                <a href="/tasks/{sub.id}" class="hover:underline">{sub.title}</a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Edges (dependencies) -->
      {#if payload.edges.length > 0}
        <section data-task-edges class="mb-6">
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">Dependencies</h2>
          <div class="flex flex-wrap gap-2">
            {#each payload.edges as edge (edge.id)}
              <span data-edge-chip class="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs">
                {edge.rel}: {edge.from_id === payload.task.id ? edge.to_id : edge.from_id}
              </span>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Activity feed -->
      {#if payload.events.length > 0}
        <section data-task-activity class="mb-6">
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">Activity ({payload.events.length})</h2>
          <ul class="space-y-2">
            {#each payload.events as event (event.id)}
              <li data-activity-item class="text-sm text-muted-foreground">
                <span class="font-medium text-foreground">{event.actor}</span>
                {event.verb}
                <span class="text-xs">{event.created_at}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Status/Priority overlay (triggered by keyboard shortcuts) -->
      {#if activeOverlay === "status"}
        <div data-overlay-status class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onclick={() => (activeOverlay = null)} role="presentation">
          <div class="bg-background rounded-lg border border-border p-4 shadow-lg" onclick={(event) => event.stopPropagation()} role="presentation">
            <h3 class="text-sm font-semibold mb-2">Set status</h3>
            {#each TASK_STATUSES as s (s)}
              <button
                type="button"
                class="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded"
                onclick={() => { postForm("update", { status: s }); activeOverlay = null; }}
              >{describeStatus(s)}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if activeOverlay === "priority"}
        <div data-overlay-priority class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onclick={() => (activeOverlay = null)} role="presentation">
          <div class="bg-background rounded-lg border border-border p-4 shadow-lg" onclick={(event) => event.stopPropagation()} role="presentation">
            <h3 class="text-sm font-semibold mb-2">Set priority</h3>
            {#each [0,1,2,3,4,5] as p (p)}
              <button
                type="button"
                class="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded"
                onclick={() => { postForm("update", { priority: String(p) }); activeOverlay = null; }}
              >P{p}</button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <footer class="flex items-center gap-2 border-t border-border pt-4">
        <button type="button" data-task-save onclick={onSave} class={cn(buttonVariants({ variant: "default" }))}>Save</button>
        <button type="button" data-task-delete onclick={onDelete} class={cn(buttonVariants({ variant: "destructive" }))}>Delete</button>
      </footer>
    </article>
  {/if}
{/await}
