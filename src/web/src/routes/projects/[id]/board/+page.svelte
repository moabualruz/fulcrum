<script lang="ts">
  import KanbanBoard from "$lib/components/board/KanbanBoard.svelte";
  import ProjectViewSwitcher from "$lib/components/board/ProjectViewSwitcher.svelte";
  import InContextSearchBar from "$lib/components/search/InContextSearchBar.svelte";
  import TaskCalendar from "$lib/components/tasks/TaskCalendar.svelte";
  import TaskList from "$lib/components/tasks/TaskList.svelte";
  import TaskTable from "$lib/components/tasks/TaskTable.svelte";
  import TaskTimeline from "$lib/components/tasks/TaskTimeline.svelte";
  import SavedViewFilterBuilder from "$lib/components/saved-views/SavedViewFilterBuilder.svelte";
  import { cn } from "$lib/utils.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();
  const activeView = $derived(
    data.view === "list" || data.view === "table" || data.view === "calendar" || data.view === "timeline" ? data.view : "board",
  );
</script>

<div class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3")}>
    <div>
      <a href="/projects/{data.project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.project.name}</h1>
    </div>
  </header>

  <ProjectViewSwitcher projectId={data.project.id} active={activeView} />
  <InContextSearchBar kind="task" projectId={data.project.id} placeholder="Search tasks" />
  <SavedViewFilterBuilder
    projectId={data.project.id}
    activeView={activeView}
    query={data.transientQuery}
    savedViews={data.savedViews}
  />
  {#if activeView === "list"}
    <TaskList projectId={data.project.id} tasks={data.tasks} />
  {:else if activeView === "table"}
    <TaskTable tasks={data.tasks} sort={{ column: "created_at", direction: "asc" }} />
  {:else if activeView === "calendar"}
    <TaskCalendar
      projectId={data.project.id}
      tasks={data.tasks}
      initialMonth={data.month ?? new Date()}
      activeSprint={data.activeSprint ?? null}
    />
  {:else if activeView === "timeline"}
    <TaskTimeline projectId={data.project.id} tasks={data.tasks} />
  {:else}
    <KanbanBoard projectId={data.project.id} tasks={data.tasks} activeSprintId={data.activeSprintId} />
  {/if}
</div>
