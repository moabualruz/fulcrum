<script lang="ts">
  import ProjectViewSwitcher from "$lib/components/board/ProjectViewSwitcher.svelte";
  import TaskList from "$lib/components/tasks/TaskList.svelte";
  import { cn } from "$lib/utils.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();
  const project = $derived({
    id: data.project?.id ?? data.projectId,
    name: data.project?.name ?? "Tasks",
  });
  const tasks = $derived(data.tasks ?? []);
</script>

<div class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3")}>
    <div>
      <a href="/projects/{project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{project.name}</h1>
    </div>
  </header>

  <ProjectViewSwitcher projectId={project.id} active="list" />
  {#await data.streamed.data}
    <TaskList projectId={project.id} tasks={[]} />
  {:then payload}
    <TaskList projectId={project.id} tasks={payload.tasks ?? tasks} />
  {/await}
</div>
