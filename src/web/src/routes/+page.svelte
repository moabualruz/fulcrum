<script lang="ts">
  import { cn } from "$lib/utils.js";
  import MetricCard from "$lib/components/dashboard/MetricCard.svelte";
  import ProjectTiles from "$lib/components/dashboard/ProjectTiles.svelte";
  import RecentRuns from "$lib/components/dashboard/RecentRuns.svelte";
  import RecentDocs from "$lib/components/dashboard/RecentDocs.svelte";
  import TopTasks from "$lib/components/dashboard/TopTasks.svelte";
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
</script>

<header data-dashboard-header class={cn("mb-6")}>
  <h1 class={cn("text-2xl font-bold tracking-tight")}>Dashboard</h1>
</header>

{#await data.streamed.dashboard}
  <div class={cn("grid gap-4 md:grid-cols-4 mb-6")}>
    <div data-dashboard-skeleton class={cn("h-24 rounded-lg border border-border bg-card animate-pulse")}></div>
    <div data-dashboard-skeleton class={cn("h-24 rounded-lg border border-border bg-card animate-pulse")}></div>
    <div data-dashboard-skeleton class={cn("h-24 rounded-lg border border-border bg-card animate-pulse")}></div>
    <div data-dashboard-skeleton class={cn("h-24 rounded-lg border border-border bg-card animate-pulse")}></div>
  </div>
{:then dashboard}
  <div data-dashboard-grid class={cn("space-y-6")}>
    <div class={cn("grid gap-4 md:grid-cols-4")}>
      <MetricCard label="Projects" value={dashboard.counters.projects} href="/projects" />
      <MetricCard label="Open tasks" value={dashboard.counters.openTasks} href="/boards" />
      <MetricCard label="Docs" value={dashboard.counters.docs} href="/docs" />
      <MetricCard label="Runs (7d)" value={dashboard.counters.runsLast7d} href="/runs" />
    </div>
    <ProjectTiles tiles={dashboard.projectTiles} />
    <div class={cn("grid gap-6 md:grid-cols-3")}>
      <RecentRuns runs={dashboard.recentRuns} />
      <RecentDocs docs={dashboard.recentDocs} />
      <TopTasks tasks={dashboard.topTasks} />
    </div>
  </div>
{:catch err}
  <p class={cn("text-destructive text-sm")}>Failed to load dashboard: {err.message}</p>
{/await}
