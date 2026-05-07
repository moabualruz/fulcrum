<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";
  import CalendarView from "$lib/components/tasks/CalendarView.svelte";
  import ProjectViewSwitcher from "$lib/components/board/ProjectViewSwitcher.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();

  function openTask(taskId: string): void {
    void goto(`/projects/${data.project.id}/board?task=${taskId}`);
  }
</script>

<div class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3")}>
    <div>
      <a href="/projects/{data.project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>
        ← Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Calendar</h1>
    </div>
  </header>

  <ProjectViewSwitcher projectId={data.project.id} active="calendar" />

  <CalendarView
    projectId={data.project.id}
    tasks={data.tasks}
    activeSprint={data.activeSprint}
    ontaskclick={openTask}
  />
</div>
