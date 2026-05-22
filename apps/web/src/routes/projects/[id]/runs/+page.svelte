<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { browser } from "$app/environment";
  import type { PageData } from "./$types";
  import RunStatusBadge from "$lib/components/runs/RunStatusBadge.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { SYMPHONY_COLORS, type SymphonyState } from "$lib/orchestration";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // 5s polling fallback
  $effect(() => {
    if (!browser) return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 5000);
    return () => clearInterval(handle);
  });
</script>

<header
  data-project-runs-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Runs</h1>
  </div>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {#if payload.runs.length === 0}
    <div
      data-empty-project-runs
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No runs for this project.</div>
  {:else}
    <div data-project-runs-board class={cn("flex flex-col gap-3")}>
      {#each payload.runs as run (run.id)}
        <a
          href="/projects/{data.projectId}/runs/{run.id}"
          data-run-card
          class={cn("flex items-center justify-between rounded-lg border border-border bg-background p-4 hover:bg-accent/50 transition-colors")}
        >
          <div class={cn("flex items-center gap-3")}>
            <span class={cn("font-medium")}>{run.agent}</span>
            <RunStatusBadge status={run.status} />
            {#if run.symphony_state}
              {@const stateColor = SYMPHONY_COLORS[run.symphony_state as SymphonyState] ?? "bg-muted text-muted-foreground"}
              <span
                data-symphony-badge
                class={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", stateColor)}
              >{run.symphony_state}</span>
            {/if}
          </div>
          <div class={cn("flex items-center gap-3 text-xs text-muted-foreground")}>
            {#if run.retry_count > 0}
              <span>retries: {run.retry_count}</span>
            {/if}
            <span class={cn("font-mono")}>{run.started_at}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
{/await}
