<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { SearchHit } from "../../../../product-kernel/search";

  interface Props {
    data: {
      q: string;
      hits: SearchHit[];
      grouped: Record<string, SearchHit[]>;
    };
  }

  let { data }: Props = $props();

  const groups = $derived(
    Object.entries(data.grouped).filter((entry) => entry[1].length > 0),
  );

  function hrefFor(hit: SearchHit): string {
    switch (hit.source_kind) {
      case "doc":
        return `/docs/${hit.source_id}`;
      case "task":
        return `/boards?task=${encodeURIComponent(hit.source_id)}`;
      case "run":
        return `/runs/${hit.source_id}`;
      case "memory":
        return `/memory/${hit.source_id}`;
      default:
        return `/search?q=${encodeURIComponent(data.q)}`;
    }
  }

  function formatScore(score: number): string {
    return score.toFixed(3);
  }
</script>

<header class={cn("mb-4 flex items-center justify-between gap-4 border-b border-border pb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Search</h1>
</header>

<form data-search-form method="GET" class={cn("mb-4 flex flex-wrap items-center gap-2")}>
  <input
    data-search-input
    type="search"
    name="q"
    value={data.q}
    placeholder="Search docs, tasks, runs, memory"
    class={cn(
      "border-input bg-background placeholder:text-muted-foreground flex h-9 w-full max-w-xl rounded-md border px-3 py-1 text-sm shadow-xs",
    )}
  />
  <button
    type="submit"
    class={cn("border-input bg-background h-9 rounded-md border px-4 text-sm font-medium shadow-xs hover:bg-accent")}
  >Search</button>
</form>

{#if data.q === ""}
  <div
    data-search-no-query
    class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
  >Type a query to search product documents.</div>
{:else if data.hits.length === 0}
  <div
    data-search-empty
    class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
  >No results. Try different terms or fewer words.</div>
{:else}
  <div class={cn("space-y-6")}>
    {#each groups as [kind, hits] (kind)}
      <section data-search-group data-source-kind={kind} class={cn("space-y-2")}>
        <h2 class={cn("text-sm font-semibold uppercase text-muted-foreground")}>{kind}</h2>
        <ul class={cn("divide-y divide-border rounded-md border border-border")}>
          {#each hits as hit (hit.id)}
            <li data-search-hit class={cn("p-3")}>
              <a href={hrefFor(hit)} class={cn("font-medium hover:underline")}>{hit.title}</a>
              <div class={cn("mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground")}>
                <span>{hit.source_kind}:{hit.source_id}</span>
                <span>score {formatScore(hit.score)}</span>
              </div>
              <p class={cn("mt-2 line-clamp-2 text-sm text-muted-foreground")}>{hit.body}</p>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}
