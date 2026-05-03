<script lang="ts">
  import ProjectViewSwitcher from "$lib/components/board/ProjectViewSwitcher.svelte";
  import TaskTable from "$lib/components/tasks/TaskTable.svelte";
  import { cn } from "$lib/utils.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();
</script>

<div class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3")}>
    <div>
      <a href="/projects/{data.project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.project.name}</h1>
    </div>
  </header>

  <ProjectViewSwitcher projectId={data.project.id} active="table" />
  <TaskTable tasks={data.tasks} sort={{ column: "created_at", direction: "asc" }} />
</div>
