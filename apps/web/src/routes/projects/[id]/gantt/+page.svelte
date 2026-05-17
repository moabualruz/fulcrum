<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";
  import GanttView from "$lib/components/tasks/GanttView.svelte";
  import ProjectViewSwitcher from "$lib/components/board/ProjectViewSwitcher.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();

  let groupBy = $state<"epic" | "assignee" | "sprint">("epic");

  function openTask(taskId: string): void {
    // Navigate to board view with task selected (D-62)
    void goto(`/projects/${data.project.id}/board?task=${taskId}`);
  }
</script>

<div class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3")}>
    <div>
      <a href="/projects/{data.project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>
        ← Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Gantt</h1>
    </div>

    <div class="flex items-center gap-2">
      <label for="group-by" class="text-sm text-muted-foreground">Group:</label>
      <select
        id="group-by"
        bind:value={groupBy}
        class="text-sm rounded-md border border-border bg-background px-2 py-1"
      >
        <option value="epic">Epic</option>
        <option value="assignee">Assignee</option>
        <option value="sprint">Sprint</option>
      </select>
    </div>
  </header>

  <ProjectViewSwitcher projectId={data.project.id} active="gantt" />

  <GanttView
    projectId={data.project.id}
    tasks={data.tasks}
    relationships={data.relationships}
    {groupBy}
    ontaskclick={openTask}
  />
</div>
