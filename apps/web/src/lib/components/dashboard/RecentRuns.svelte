<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface RunRow {
    id: string;
    agent: string;
    status: string;
    started_at: string;
    ended_at: string | null;
  }

  interface Props {
    runs: RunRow[];
  }

  const { runs }: Props = $props();

  const visible = $derived(runs.slice(0, 5));
</script>

<section data-recent-runs class={cn("space-y-2")}>
  <h3 class={cn("text-sm font-semibold tracking-tight")}>Recent runs</h3>
  {#if runs.length === 0}
    <div data-recent-runs-empty class={cn("text-sm text-muted-foreground")}>
      No recent runs.
    </div>
  {:else}
    <ul class={cn("space-y-1")}>
      {#each visible as run (run.id)}
        <li
          data-recent-run
          data-run-id={run.id}
          class={cn("flex items-center gap-2 text-sm")}
        >
          <a href={"/runs/" + run.id} class={cn("hover:underline font-medium")}>{run.agent}</a>
          <span data-status class={cn("text-muted-foreground")}>{run.status}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
