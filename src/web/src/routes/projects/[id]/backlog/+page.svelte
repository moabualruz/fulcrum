<script lang="ts">
  import type { BacklogTask, SprintListing } from "$lib/product-queries";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: {
      projectId: string;
      streamed: {
        data: Promise<{ tasks: BacklogTask[]; sprints: SprintListing[] }> | { tasks: BacklogTask[]; sprints: SprintListing[] };
      };
    };
  }
  const { data }: Props = $props();

  let resolvedTasks = $state<BacklogTask[]>([]);
  let resolvedSprints = $state<SprintListing[]>([]);
  let sortField = $state<"priority" | "title" | "status">("priority");
  let sortDir = $state<"asc" | "desc">("desc");

  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) {
      resolvedTasks = d.tasks;
      resolvedSprints = d.sprints;
    }
  }

  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      let cancelled = false;
      void d.then((p) => {
        if (!cancelled) {
          resolvedTasks = p.tasks;
          resolvedSprints = p.sprints;
        }
      });
      return () => { cancelled = true; };
    } else {
      resolvedTasks = d.tasks;
      resolvedSprints = d.sprints;
    }
  });

  const sortedTasks = $derived(() => {
    const tasks = [...resolvedTasks];
    tasks.sort((a, b) => {
      let cmp = 0;
      if (sortField === "priority") cmp = a.priority - b.priority;
      else if (sortField === "title") cmp = a.title.localeCompare(b.title);
      else if (sortField === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return tasks;
  });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = field === "priority" ? "desc" : "asc";
    }
  }

  // Sprint planning panel: capacity bar
  let selectedSprintId = $state<string | null>(null);
  const selectedSprint = $derived(resolvedSprints.find((s) => s.id === selectedSprintId) ?? null);

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

  async function assignToSprint(taskId: string, sprintId: string): Promise<void> {
    await postForm("assign", { taskId, sprintId });
  }
</script>

<header data-backlog-header class={cn("flex items-center justify-between border-b border-border pb-3 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Backlog</h1>
  </div>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="table" />
{:then _payload}
  <div class={cn("flex gap-6")}>
    <!-- Backlog table -->
    <div class={cn("flex-1 overflow-auto")} data-backlog-table>
      <div class={cn("mb-3")}>
        <form method="POST" action="?/create" class={cn("flex gap-2")}>
          <input
            name="title"
            type="text"
            placeholder="Quick-add task…"
            required
            data-backlog-quick-add
            class={cn("border-input bg-background h-9 flex-1 rounded-md border px-3 py-1 text-sm shadow-xs")}
          />
          <button
            type="submit"
            class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs")}
          >Add</button>
        </form>
      </div>

      <table class={cn("w-full text-sm")} role="table" aria-label="Backlog tasks">
        <thead>
          <tr class={cn("border-b border-border text-left")}>
            <th class={cn("pb-2 pr-4 font-medium")}>
              <button onclick={() => toggleSort("title")} class={cn("hover:underline")} type="button">
                Title {sortField === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th class={cn("pb-2 pr-4 font-medium")}>
              <button onclick={() => toggleSort("status")} class={cn("hover:underline")} type="button">
                Status {sortField === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th class={cn("pb-2 pr-4 font-medium")}>
              <button onclick={() => toggleSort("priority")} class={cn("hover:underline")} type="button">
                Priority {sortField === "priority" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th class={cn("pb-2 pr-4 font-medium")}>Est.</th>
            <th class={cn("pb-2 font-medium")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedTasks() as task (task.id)}
            <tr data-backlog-row data-task-id={task.id} class={cn("border-b border-border/50 hover:bg-muted/30")}>
              <td class={cn("py-2 pr-4")}>{task.title}</td>
              <td class={cn("py-2 pr-4")}>
                <span class={cn("rounded-full border px-2 py-0.5 text-xs")}>{task.status}</span>
              </td>
              <td class={cn("py-2 pr-4 tabular-nums")}>{task.priority}</td>
              <td class={cn("py-2 pr-4 tabular-nums")}>{task.estimate}</td>
              <td class={cn("py-2")}>
                {#if selectedSprintId}
                  <button
                    type="button"
                    data-assign-btn
                    onclick={() => assignToSprint(task.id, selectedSprintId!)}
                    class={cn("text-xs text-primary hover:underline")}
                  >→ Sprint</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if resolvedTasks.length === 0}
        <p class={cn("py-8 text-center text-muted-foreground")}>No backlog tasks. Add one above.</p>
      {/if}
    </div>

    <!-- Sprint planning side panel -->
    <aside data-sprint-panel class={cn("w-72 shrink-0 rounded-lg border border-border bg-muted/20 p-4")}>
      <h2 class={cn("mb-3 text-lg font-semibold")}>Sprint Planning</h2>

      {#if resolvedSprints.length === 0}
        <p class={cn("text-sm text-muted-foreground")}>No sprints yet. <a href="/projects/{data.projectId}/sprints" class={cn("text-primary hover:underline")}>Create one</a>.</p>
      {:else}
        <label for="sprint-select" class={cn("mb-1 block text-sm font-medium")}>Target Sprint</label>
        <select
          id="sprint-select"
          data-sprint-select
          class={cn("border-input bg-background mb-3 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
          onchange={(e) => { selectedSprintId = (e.currentTarget as HTMLSelectElement).value || null; }}
        >
          <option value="">Select sprint…</option>
          {#each resolvedSprints.filter((s) => s.status !== "completed") as sprint (sprint.id)}
            <option value={sprint.id}>{sprint.name} ({sprint.status})</option>
          {/each}
        </select>

        {#if selectedSprint}
          <div data-capacity-bar class={cn("mb-2")}>
            <div class={cn("flex justify-between text-xs text-muted-foreground mb-1")}>
              <span>{selectedSprint.total_estimate} / {selectedSprint.capacity} pts</span>
              <span>{selectedSprint.task_count} tasks</span>
            </div>
            <div class={cn("h-2 w-full rounded-full bg-muted")}>
              {@const pct = selectedSprint.capacity > 0 ? Math.min(100, (selectedSprint.total_estimate / selectedSprint.capacity) * 100) : 0}
              <div
                class={cn("h-2 rounded-full", pct > 90 ? "bg-destructive" : "bg-primary")}
                style="width: {pct}%"
              ></div>
            </div>
          </div>
        {/if}
      {/if}
    </aside>
  </div>
{/await}
