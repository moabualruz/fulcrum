<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { browser } from "$app/environment";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // 5s polling fallback (SSE when FULCRUM_FEATURES=real-time-collab-server)
  $effect(() => {
    if (!browser) return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 5000);
    return () => clearInterval(handle);
  });
</script>

<header
  data-orchestration-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Orchestration</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <!-- Status tile -->
  <section data-orchestration-status class={cn("mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4")}>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Last tick</div>
      <div class={cn("text-sm font-medium")}>{payload.status.lastTickAt ?? "Never"}</div>
    </div>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Worker</div>
      <div class={cn("text-sm font-medium")}>{payload.status.workerConnected ? "Connected" : "Disconnected"}</div>
    </div>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Concurrency</div>
      <div class={cn("text-sm font-medium")}>{payload.status.concurrencyUsed} / {payload.status.concurrencyMax}</div>
    </div>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Last sync</div>
      <div class={cn("text-sm font-medium")}>{payload.status.lastSyncDate ?? "Never"}</div>
    </div>
  </section>

  <!-- Recent dispatches table -->
  <section data-orchestration-dispatches class={cn("mb-6")}>
    <h2 class={cn("text-lg font-semibold mb-2")}>Recent dispatches</h2>
    {#if payload.dispatches.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No dispatches yet.</div>
    {:else}
      <div class={cn("overflow-auto rounded-lg border border-border")}>
        <table class={cn("w-full text-sm")}>
          <thead>
            <tr class={cn("border-b border-border bg-muted/50")}>
              <th class={cn("px-3 py-2 text-left font-medium")}>Agent</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Status</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Symphony</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Started</th>
            </tr>
          </thead>
          <tbody>
            {#each payload.dispatches as d (d.id)}
              <tr class={cn("border-b border-border last:border-0")}>
                <td class={cn("px-3 py-2")}>{d.agent}</td>
                <td class={cn("px-3 py-2")}>{d.status}</td>
                <td class={cn("px-3 py-2")}>{d.symphony_state ?? "—"}</td>
                <td class={cn("px-3 py-2 font-mono text-xs")}>{d.started_at}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- Retry queue -->
  <section data-orchestration-retry-queue>
    <h2 class={cn("text-lg font-semibold mb-2")}>Retry queue</h2>
    {#if payload.retryQueue.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No runs awaiting retry.</div>
    {:else}
      <ul class={cn("flex flex-col gap-2")}>
        {#each payload.retryQueue as r (r.id)}
          <li class={cn("rounded-md border border-border bg-background p-3 text-sm")}>
            <span class={cn("font-medium")}>{r.agent}</span>
            {#if r.last_error_kind}
              <span class={cn("ml-2 text-xs text-muted-foreground")}>{r.last_error_kind}</span>
            {/if}
            <span class={cn("ml-2 text-xs text-muted-foreground")}>retries: {r.retry_count}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/await}
