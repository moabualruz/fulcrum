<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import RunsTable from "$lib/components/runs/RunsTable.svelte";
  import { applyRunsFilters, type RunRow } from "$lib/components/runs/runs-filters";
  import InContextSearchBar from "$lib/components/search/InContextSearchBar.svelte";
  import type { SortColumn, SortDirection } from "$lib/components/runs/runs-table-sort";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const STATUSES = [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ] as const;

  const RANGES = ["24h", "7d", "30d", "all"] as const;

  let sort = $state<{ column: SortColumn; direction: SortDirection } | undefined>(
    undefined,
  );
  let selectedAgent = $state(data.filter.agent);
  let selectedStatus = $state(data.filter.status);
  let selectedProject = $state(data.filter.project);
  let selectedRange = $state(data.filter.range);
  let selectedDateFrom = $state(data.filter.dateFrom ?? "");
  let selectedDateTo = $state(data.filter.dateTo ?? "");
  let reassignOpen = $state(false);
  let reassignedAgent = $state("claude-code");

  const reassignAgents = [
    { id: "claude-code", status: "ready", detail: "latency 0.8s · transcript seed enabled" },
    { id: "codex", status: "ready", detail: "latency 0.6s · context copy enabled" },
    { id: "gemini-cli", status: "paused", detail: "resume required before takeover" },
  ];

  function onSort(column: SortColumn): void {
    if (sort && sort.column === column) {
      sort = { column, direction: sort.direction === "asc" ? "desc" : "asc" };
    } else {
      sort = { column, direction: "asc" };
    }
  }

  function visibleRuns(runs: RunRow[]): RunRow[] {
    return applyRunsFilters(runs, {
      agent: selectedAgent,
      status: selectedStatus,
      project: selectedProject,
      range: selectedRange,
      dateFrom: selectedDateFrom,
      dateTo: selectedDateTo,
    });
  }
</script>

<header
  data-runs-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Agent runs</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const runs = payload.runs}
  {@const filteredRuns = visibleRuns(runs)}
  {@const tasks = payload.tasks ?? []}
  {@const projectOptions = payload.projects ?? []}
  {@const agents = Array.from(new Set(runs.map((r) => r.agent))).sort()}
  {@const projects = Array.from(new Set(runs.map((r) => r.project_id ?? ""))).sort()}
  <div class={cn("mb-3")}>
    <InContextSearchBar
      kind="run"
      projectId={data.filter.project === "__any__" ? null : data.filter.project}
      orgId={data.orgId}
      placeholder="Search runs"
    />
  </div>
  <form
    data-runs-dispatch
    method="POST"
    action="?/dispatch"
    use:enhance
    class={cn("mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border p-3")}
  >
    <select
      name="projectId"
      aria-label="Project"
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="">No project</option>
      {#each projectOptions as project (project.id)}
        <option value={project.id}>{project.name}</option>
      {/each}
    </select>
    <select
      name="taskId"
      aria-label="Task"
      required
      class={cn("border-input bg-background flex h-9 min-w-48 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="">Task</option>
      {#each tasks as task (task.id)}
        <option value={task.id}>{task.title}</option>
      {/each}
    </select>
    <select
      name="agent"
      aria-label="Agent"
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="codex">codex</option>
      <option value="claude">claude</option>
      <option value="gemini">gemini</option>
    </select>
    <button type="submit" class={cn(buttonVariants())}>Dispatch</button>
  </form>

  <section
    data-runs-reassign
    class={cn("mb-4 rounded-md border border-border bg-card p-3")}
  >
    <div class={cn("flex flex-wrap items-center justify-between gap-3")}>
      <div>
        <h2 class={cn("text-sm font-semibold tracking-normal")}>Live run controls</h2>
        <p class={cn("mt-1 text-xs text-muted-foreground")}>Move a running session to another agent without losing transcript context.</p>
      </div>
      <button
        type="button"
        data-action="reassign"
        class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        onclick={() => reassignOpen = !reassignOpen}
      >Reassign agent</button>
    </div>
    {#if reassignOpen}
      <div data-runs-reassign-popover class={cn("mt-3 grid gap-2 rounded-md border border-border bg-background p-3")}>
        {#each reassignAgents as agent}
          <button
            type="button"
            class={cn("grid gap-1 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted")}
            data-runs-reassign-agent={agent.id}
            onclick={() => reassignedAgent = agent.id}
          >
            <span class={cn("font-semibold")}>{agent.id} <span class={cn("text-xs text-muted-foreground")}>[{agent.status}]</span></span>
            <span class={cn("text-xs text-muted-foreground")}>{agent.detail}</span>
          </button>
        {/each}
        <div data-runs-reassign-status class={cn("rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground")}>
          Reassign in progress · copied transcript seed to {reassignedAgent} · old session marked reassigned
        </div>
      </div>
    {/if}
  </section>

  <section
    data-runs-filter
    class={cn("mb-3 flex flex-wrap items-center gap-2")}
  >
    <select
      data-runs-agent-filter
      name="agent"
      aria-label="Filter by agent"
      bind:value={selectedAgent}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="">All agents</option>
      {#each agents as agent (agent)}
        <option value={agent}>{agent}</option>
      {/each}
    </select>
    <select
      data-runs-status-filter
      name="status"
      aria-label="Filter by status"
      bind:value={selectedStatus}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="">All statuses</option>
      {#each STATUSES as status (status)}
        <option value={status}>{status}</option>
      {/each}
    </select>
    <select
      data-runs-project-filter
      name="project"
      aria-label="Filter by project"
      bind:value={selectedProject}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="__any__">All projects</option>
      {#each projects as project (project)}
        <option value={project}>{project === "" ? "(no project)" : project}</option>
      {/each}
    </select>
    <select
      data-runs-range-filter
      name="range"
      aria-label="Filter by time range"
      bind:value={selectedRange}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      {#each RANGES as range (range)}
        <option value={range}>{range}</option>
      {/each}
    </select>
    <input
      data-runs-date-from-filter
      type="date"
      aria-label="Filter from date"
      bind:value={selectedDateFrom}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    />
    <input
      data-runs-date-to-filter
      type="date"
      aria-label="Filter to date"
      bind:value={selectedDateTo}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    />
  </section>

  {#if filteredRuns.length === 0}
    <div
      data-empty-runs
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No agent runs match the current filters.</div>
  {:else}
    <RunsTable rows={filteredRuns} {sort} {onSort} />
  {/if}
{/await}
