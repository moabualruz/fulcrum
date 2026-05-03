<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  function truncatePayload(payload: Record<string, unknown>): string {
    const s = JSON.stringify(payload);
    if (s.length <= 100) return s;
    return s.slice(0, 100) + "…";
  }

  function exportUrl(format: "csv" | "json"): string {
    const params = new URLSearchParams();
    params.set("format", format);
    if (data.filter.kind) params.set("kind", data.filter.kind);
    if (data.filter.verb) params.set("verb", data.filter.verb);
    if (data.filter.actor) params.set("actor", data.filter.actor);
    if (data.filter.project) params.set("project", data.filter.project);
    if (data.filter.since) params.set("since", data.filter.since);
    if (data.filter.until) params.set("until", data.filter.until);
    return `/audit/export?${params.toString()}`;
  }
</script>

<header
  data-audit-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Audit log</h1>
  <div class={cn("flex gap-2")}>
    <a
      data-export-csv
      href={exportUrl("csv")}
      download
      class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >Download CSV</a>
    <a
      data-export-json
      href={exportUrl("json")}
      download
      class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >Download JSON</a>
  </div>
</header>

<form
  data-audit-filter
  method="GET"
  class={cn("mb-3 flex flex-wrap items-center gap-2")}
>
  <input
    data-audit-kind-filter
    name="kind"
    type="text"
    placeholder="Subject kind"
    value={data.filter.kind}
    aria-label="Filter by subject kind"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  />
  <input
    data-audit-verb-filter
    name="verb"
    type="text"
    placeholder="Verb"
    value={data.filter.verb}
    aria-label="Filter by verb"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  />
  <input
    data-audit-actor-filter
    name="actor"
    type="text"
    placeholder="Actor"
    value={data.filter.actor}
    aria-label="Filter by actor"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  />
  <input
    data-audit-since-filter
    name="since"
    type="date"
    value={data.filter.since}
    aria-label="From date"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  />
  <input
    data-audit-until-filter
    name="until"
    type="date"
    value={data.filter.until}
    aria-label="Until date"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
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
      data-empty-audit
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No audit events match the current filters.</div>
  {:else}
    <div class={cn("overflow-x-auto")}>
      <table class={cn("w-full text-sm")}>
        <thead>
          <tr class={cn("border-b text-left text-muted-foreground")}>
            <th class={cn("px-2 py-2")}>Timestamp</th>
            <th class={cn("px-2 py-2")}>Actor</th>
            <th class={cn("px-2 py-2")}>Kind</th>
            <th class={cn("px-2 py-2")}>Verb</th>
            <th class={cn("px-2 py-2")}>Subject</th>
            <th class={cn("px-2 py-2")}>Payload</th>
          </tr>
        </thead>
        <tbody>
          {#each events as event (event.id)}
            <tr data-audit-row data-event-id={event.id} class={cn("border-b")}>
              <td class={cn("px-2 py-2 whitespace-nowrap")}>{event.created_at}</td>
              <td class={cn("px-2 py-2")}>{event.actor}</td>
              <td class={cn("px-2 py-2")}>{event.subject_kind}</td>
              <td class={cn("px-2 py-2")}>{event.verb}</td>
              <td class={cn("px-2 py-2 font-mono text-xs")}>{event.subject_id}</td>
              <td class={cn("px-2 py-2 font-mono text-xs max-w-xs truncate")}>{truncatePayload(event.payload)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if payload.total > events.length}
      <div class={cn("mt-3 text-sm text-muted-foreground")}>
        Showing {events.length} of {payload.total} events.
      </div>
    {/if}
  {/if}
{/await}
