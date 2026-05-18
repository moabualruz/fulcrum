<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<header
  data-activity-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Project Activity</h1>
</header>

<form
  data-activity-filter
  method="GET"
  class={cn("mb-3 flex flex-wrap items-center gap-2")}
>
  <input type="hidden" name="id" value={data.projectId} />
  <select
    data-activity-kind-filter
    name="kind"
    aria-label="Filter by kind"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  >
    <option value="" selected={!data.filter.kind}>All kinds</option>
    {#each ["task", "doc", "project", "run"] as kind (kind)}
      <option value={kind} selected={data.filter.kind === kind}>{kind}</option>
    {/each}
  </select>
  <select
    data-activity-verb-filter
    name="verb"
    aria-label="Filter by verb"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  >
    <option value="" selected={!data.filter.verb}>All verbs</option>
    {#each ["created", "updated", "deleted", "assigned", "status_changed", "commented"] as verb (verb)}
      <option value={verb} selected={data.filter.verb === verb}>{verb}</option>
    {/each}
  </select>
  <input
    data-activity-actor-filter
    type="text"
    name="actor"
    placeholder="Actor"
    aria-label="Filter by actor"
    value={data.filter.actor ?? ""}
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground")}
  />
  <button
    type="submit"
    class={cn(buttonVariants({ variant: "outline" }))}
  >Apply</button>
</form>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const events = payload.events}
  {#if events.length === 0}
    <div
      data-empty-activity
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No activity matches the current filters.</div>
  {:else}
    <ul data-activity-list class={cn("space-y-2")}>
      {#each events as event (event.id)}
        <li
          data-activity-card
          data-event-id={event.id}
          class={cn("flex items-start gap-3 rounded-lg border border-border p-3")}
        >
          <div class={cn("min-w-0 flex-1")}>
            <p class={cn("text-sm font-medium")}>
              <span data-event-kind>{event.subject_kind}</span>
              <span class="mx-1">&middot;</span>
              <span data-event-verb>{event.verb}</span>
              <span class="mx-1">&middot;</span>
              <span data-event-subject class="text-muted-foreground">{event.subject_id}</span>
            </p>
            <p class={cn("text-xs text-muted-foreground mt-0.5")}>
              <span data-event-actor>{event.actor}</span>
              <span class="mx-1">&middot;</span>
              <time data-event-time>{timeAgo(event.created_at)}</time>
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{/await}
