<script lang="ts">
  import { EmptyState, TaskRow } from "@fulcrum/ui-kit";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";

  interface RawTask {
    id: string;
    title: string;
    status?: string | null;
    priority?: number | null;
    assigneeId?: string | null;
    points?: number | null;
    externalId?: string | null;
    projectId?: string | null;
  }

  interface Props {
    data: {
      project: string;
      activeProjectId: string | null;
      streamed: { data: Promise<{ tasks: RawTask[] }> | { tasks: RawTask[] } };
    };
  }
  const { data }: Props = $props();

  let tasks = $state<RawTask[]>([]);
  let loaded = $state(false);

  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) {
      tasks = d.tasks;
      loaded = true;
    }
  }

  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      void d.then((resolved) => {
        tasks = resolved.tasks;
        loaded = true;
      });
    }
  });

  // Map server priority (0–20) → TaskRow P0–P4 vocabulary; clamp + bucket.
  function priorityLabel(p: number | null | undefined): "P0" | "P1" | "P2" | "P3" | "P4" | undefined {
    if (p == null) return undefined;
    if (p <= 0) return "P0";
    if (p === 1) return "P1";
    if (p === 2) return "P2";
    if (p === 3) return "P3";
    return "P4";
  }

  // Map raw status → ui-kit WorkflowStatus
  type WorkflowStatus =
    | "draft" | "ready" | "in_progress" | "in_review" | "blocked"
    | "done" | "completed" | "cancelled" | "todo" | "open" | "pending";
  function statusFor(s: string | null | undefined): WorkflowStatus {
    const v = (s ?? "todo").toLowerCase();
    if (v === "in_progress") return "in_progress";
    if (v === "in_review") return "in_review";
    if (v === "blocked") return "blocked";
    if (v === "done" || v === "completed") return "completed";
    if (v === "cancelled") return "cancelled";
    return "todo";
  }
</script>

<section class="route-tasks">
  <header class="route-tasks__header">
    <h1>Tasks</h1>
    <p class="muted">
      Every task across {data.activeProjectId ? "the active project" : "the workspace"}.
      Use the project board for kanban; this is the flat list.
    </p>
  </header>

  {#if !loaded}
    <RouteSkeleton label="Loading tasks…" />
  {:else if tasks.length === 0}
    <EmptyState
      tone="muted"
      title="No tasks yet."
      description={"Create a task from the project board, /capture intake, or `fulcrum tasks create`."}
    />
  {:else}
    <ul class="route-tasks__list" data-slot="task-list">
      {#each tasks as task (task.id)}
        <TaskRow
          taskKey={task.externalId ?? task.id.slice(0, 8)}
          title={task.title}
          status={statusFor(task.status)}
          assignee={task.assigneeId ?? undefined}
          priority={priorityLabel(task.priority)}
          estimate={task.points ?? undefined}
          href={`/tasks/${task.id}`}
        />
      {/each}
    </ul>
  {/if}
</section>

<style>
  .route-tasks { padding: 1.5rem 2rem; max-width: 1200px; }
  .route-tasks__header { margin-bottom: 1rem; }
  .route-tasks__header h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.25rem; }
  .route-tasks__header .muted { color: oklch(var(--muted-foreground)); margin: 0; }
  .route-tasks__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
</style>
