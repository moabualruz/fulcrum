<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { browser } from "$app/environment";
  import type { PageData } from "./$types";
  import RunStatusBadge from "$lib/components/runs/RunStatusBadge.svelte";
  import { formatDuration } from "$lib/util/duration";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  type Tab = "transcript" | "payload" | "events";
  let tab = $state<Tab>("transcript");
  let showCancel = $state(false);
  let showRetry = $state(false);

  function selectTab(next: Tab): void {
    tab = next;
  }

  // 5s polling: only run client-side, only while the run is active. Use
  // `invalidateAll()` to refetch the load(); cleanup clears the interval on
  // unmount or when status transitions out of `running`.
  $effect(() => {
    if (!browser) return;
    if (data.run.status !== "running") return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 5000);
    return () => clearInterval(handle);
  });
</script>

<header
  data-runs-detail-header
  class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/runs" data-back-runs class={cn("text-sm text-muted-foreground hover:underline")}>← Runs</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.run.agent}</h1>
    <RunStatusBadge status={data.run.status} />
  </div>
  <span class={cn("text-xs text-muted-foreground font-mono")}
    >{formatDuration(data.run.started_at, data.run.ended_at)}</span
  >
</header>

<section class={cn("mb-4 flex items-center gap-2")}>
  <button
    type="button"
    data-runs-cancel-trigger
    data-state={showCancel ? "open" : "closed"}
    onclick={() => (showCancel = true)}
    class={cn("inline-flex h-9 items-center rounded-md border border-destructive/60 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20")}
  >Cancel run</button>
  <button
    type="button"
    data-runs-retry-trigger
    data-state={showRetry ? "open" : "closed"}
    onclick={() => (showRetry = true)}
    class={cn("inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent")}
  >Retry run</button>
</section>

{#if showCancel}
  <div data-runs-cancel-confirm class={cn("mb-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-background p-3 text-xs")}>
    <span class={cn("text-muted-foreground")}>Cancel this run? This cannot be undone.</span>
    <form method="POST" action="?/cancel" use:enhance class={cn("flex items-center gap-2")}>
      <button type="button" onclick={() => (showCancel = false)} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent")}>Back</button>
      <button type="submit" data-runs-cancel-submit class={cn("inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90")}>Cancel run</button>
    </form>
  </div>
{/if}

{#if showRetry}
  <div data-runs-retry-confirm class={cn("mb-3 flex items-center gap-2 rounded-md border border-border bg-background p-3 text-xs")}>
    <span class={cn("text-muted-foreground")}>Retry this run? Creates a new agent_runs row.</span>
    <form method="POST" action="?/retry" use:enhance class={cn("flex items-center gap-2")}>
      <button type="button" onclick={() => (showRetry = false)} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent")}>Back</button>
      <button type="submit" data-runs-retry-submit class={cn("inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90")}>Retry</button>
    </form>
  </div>
{/if}

<div data-runs-tabs role="tablist" class={cn("mb-2 flex items-center gap-2 border-b border-border")}>
  <button type="button" role="tab" data-tab="transcript" data-active={tab === "transcript"} onclick={() => selectTab("transcript")} class={cn("h-9 px-3 text-sm", tab === "transcript" && "font-semibold border-b-2 border-primary")}>Transcript</button>
  <button type="button" role="tab" data-tab="payload" data-active={tab === "payload"} onclick={() => selectTab("payload")} class={cn("h-9 px-3 text-sm", tab === "payload" && "font-semibold border-b-2 border-primary")}>Payload</button>
  <button type="button" role="tab" data-tab="events" data-active={tab === "events"} onclick={() => selectTab("events")} class={cn("h-9 px-3 text-sm", tab === "events" && "font-semibold border-b-2 border-primary")}>Events</button>
</div>

<div role="tabpanel" data-runs-tabpanel="transcript" hidden={tab !== "transcript"}>
  {#if data.transcript !== null}
    <pre data-runs-transcript class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{data.transcript}</pre>
  {:else}
    <div data-runs-transcript-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No transcript recorded</div>
  {/if}
</div>

<div role="tabpanel" data-runs-tabpanel="payload" hidden={tab !== "payload"}>
  <pre data-runs-payload class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{JSON.stringify(data.run, null, 2)}</pre>
</div>

<div role="tabpanel" data-runs-tabpanel="events" hidden={tab !== "events"}>
  <ul data-runs-events class={cn("flex flex-col gap-2")}>
    {#each data.events as event (event.id)}
      <li class={cn("rounded-md border border-border bg-background p-3 text-xs")}>
        <div class={cn("flex items-center justify-between")}>
          <span class={cn("font-medium")}>{event.verb}</span>
          <span class={cn("text-muted-foreground font-mono")}>{event.created_at}</span>
        </div>
        {#if Object.keys(event.payload).length > 0}
          <pre class={cn("mt-1 text-muted-foreground")}>{JSON.stringify(event.payload)}</pre>
        {/if}
      </li>
    {:else}
      <li class={cn("text-xs text-muted-foreground")}>No events recorded.</li>
    {/each}
  </ul>
</div>
