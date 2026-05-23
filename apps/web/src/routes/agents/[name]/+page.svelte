<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import RunStatusBadge from "$lib/components/runs/RunStatusBadge.svelte";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  {@const profile = payload.profile}
  {@const runs = payload.runs}

  <header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/agents" class={cn("text-sm text-muted-foreground hover:underline")}>← Agents</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{profile.name}</h1>
      {#if profile.test_passed === true}
        <span data-test-badge="passed" class={cn("inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 text-xs")}>Passed</span>
      {:else if profile.test_passed === false}
        <span data-test-badge="failed" class={cn("inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-0.5 text-xs")}>Failed</span>
      {/if}
    </div>
  </header>

  <section data-agent-detail class={cn("mb-6 space-y-3")}>
    <div class={cn("text-sm")}>
      <span class={cn("font-medium")}>CLI Path:</span>
      <code class={cn("ml-2 font-mono text-xs")}>{profile.cli_path}</code>
    </div>
    {#if profile.flags && profile.flags.length > 0}
      <div class={cn("text-sm")}>
        <span class={cn("font-medium")}>Flags:</span>
        <code class={cn("ml-2 font-mono text-xs")}>{profile.flags.join(" ")}</code>
      </div>
    {/if}
    {#if Object.keys(profile.auth_env).length > 0}
      <div class={cn("text-sm")}>
        <span class={cn("font-medium")}>Auth Env Vars:</span>
        <ul class={cn("mt-1 space-y-1")}>
          {#each Object.entries(profile.auth_env) as [key, value]}
            <li class={cn("font-mono text-xs text-muted-foreground")}>{key}: {value}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>

  <section>
    <h2 class={cn("text-lg font-semibold mb-3")}>Run History</h2>
    {#if runs.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground")}>
        No runs recorded for this agent.
      </div>
    {:else}
      <ul data-agent-runs class={cn("space-y-2")}>
        {#each runs as run (run.id)}
          <li class={cn("flex items-center justify-between rounded-md border border-border p-3 text-sm")}>
            <a href="/runs/{run.id}" class={cn("font-mono text-xs hover:underline")}>{run.id}</a>
            <RunStatusBadge status={run.status} />
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/await}
