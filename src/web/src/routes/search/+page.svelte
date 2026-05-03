<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { SearchHit } from "../../../../product-kernel/search";

  interface Props {
    data: {
      q: string;
      hits: SearchHit[];
      grouped: Record<string, SearchHit[]>;
      facets: {
        kind: Record<string, number>;
        status: Record<string, number>;
        assignee: Record<string, number>;
        project: Record<string, number>;
        author: Record<string, number>;
        tag: Record<string, number>;
      };
      params: {
        q: string;
        kind: string;
        project: string;
        status: string;
        assignee: string;
        tag: string;
        date_from: string;
        date_to: string;
        author: string;
        page: number;
      };
      pagination: { page: number; perPage: number; total: number; hasMore: boolean };
    };
  }

  let { data }: Props = $props();

  const groups = $derived(
    Object.entries(data.grouped).filter((entry) => entry[1].length > 0),
  );
  const selectedFacets = $derived(
    [
      ["kind", data.params.kind],
      ["project", data.params.project],
      ["status", data.params.status],
      ["assignee", data.params.assignee],
      ["tag", data.params.tag],
      ["author", data.params.author],
      ["date_from", data.params.date_from],
      ["date_to", data.params.date_to],
    ].filter((entry) => entry[1]),
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

  /**
   * P11#16: Record click telemetry (fire-and-forget).
   * Only sends when search-click-telemetry flag ON (server-side gate).
   */
  function recordClick(hit: SearchHit, position: number): void {
    fetch("/api/trpc/search.recordClick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: data.q,
        resultKind: hit.source_kind,
        resultId: hit.source_id,
        position,
      }),
    }).catch(() => {});
  }

  function removeFacetHref(key: string): string {
    const params = new URLSearchParams();
    if (data.q) params.set("q", data.q);
    for (const facet of ["kind", "project", "status", "assignee", "tag", "author", "date_from", "date_to"]) {
      const value = data.params[facet as keyof typeof data.params];
      if (facet !== key && typeof value === "string" && value) params.set(facet, value);
    }
    return `/search?${params.toString()}`;
  }

  function facetHref(key: string, value: string): string {
    const params = new URLSearchParams();
    if (data.q) params.set("q", data.q);
    params.set(key, value);
    return `/search?${params.toString()}`;
  }
</script>

<header class={cn("mb-4 flex items-center justify-between gap-4 border-b border-border pb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Search</h1>
  <button
    data-save-search
    type="button"
    class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm font-medium shadow-xs hover:bg-accent")}
  >Save this search</button>
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
  <div class={cn("grid gap-6 lg:grid-cols-[16rem_1fr]")}>
    <aside data-search-facets class={cn("space-y-5 border-r border-border pr-4")}>
      <section class={cn("space-y-2")}>
        <h2 class={cn("text-sm font-semibold")}>Kind</h2>
        {#each Object.entries(data.facets.kind) as [kind, count] (kind)}
          <label class={cn("flex items-center justify-between gap-2 text-sm")}>
            <span class={cn("flex items-center gap-2")}>
              <input type="checkbox" name="kind" value={kind} checked={data.params.kind === kind} />
              <a href={facetHref("kind", kind)}>{kind}</a>
            </span>
            <span class={cn("rounded border border-border px-1.5 text-xs text-muted-foreground")}>{count}</span>
          </label>
        {/each}
      </section>
      {#each [
        ["project", data.facets.project],
        ["status", data.facets.status],
        ["assignee", data.facets.assignee],
        ["tag", data.facets.tag],
        ["author", data.facets.author],
      ] as [facet, counts] (facet)}
        <section class={cn("space-y-2")}>
          <h2 class={cn("text-sm font-semibold capitalize")}>{facet}</h2>
          {#each Object.entries(counts) as [value, count] (value)}
            <a href={facetHref(facet as string, value)} class={cn("flex items-center justify-between gap-2 text-sm hover:underline")}>
              <span>{value}</span>
              <span class={cn("rounded border border-border px-1.5 text-xs text-muted-foreground")}>{count}</span>
            </a>
          {/each}
        </section>
      {/each}
      <section class={cn("space-y-2")}>
        <h2 class={cn("text-sm font-semibold")}>Date</h2>
        <input name="date_from" type="date" value={data.params.date_from} class={cn("h-8 w-full rounded border border-input bg-background px-2 text-sm")} />
        <input name="date_to" type="date" value={data.params.date_to} class={cn("h-8 w-full rounded border border-input bg-background px-2 text-sm")} />
      </section>
    </aside>

    <div class={cn("space-y-6")}>
      {#if selectedFacets.length > 0}
        <div class={cn("flex flex-wrap gap-2")}>
          {#each selectedFacets as [key, value] (`${key}:${value}`)}
            <span data-search-chip class={cn("inline-flex items-center gap-2 rounded border border-border px-2 py-1 text-xs")}>
              {key}: {value}
              <a data-remove-facet href={removeFacetHref(key)} aria-label={`Remove ${key}`}>x</a>
            </span>
          {/each}
        </div>
      {/if}

      {#each groups as [kind, hits] (kind)}
        <section data-search-group data-source-kind={kind} class={cn("space-y-2")}>
          <h2 class={cn("text-sm font-semibold uppercase text-muted-foreground")}>{kind}</h2>
          <ul class={cn("divide-y divide-border rounded-md border border-border")}>
            {#each hits as hit, hitIdx (hit.id)}
              <li data-search-hit class={cn("p-3")}>
                <a href={hrefFor(hit)} onclick={() => recordClick(hit, hitIdx)} class={cn("font-medium hover:underline")}>{hit.title}</a>
                <div class={cn("mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground")}>
                  <span>{hit.source_kind}:{hit.source_id}</span>
                  <span>{new Date(hit.updated_at).toLocaleDateString()}</span>
                  <span>score {formatScore(hit.score)}</span>
                </div>
                <p class={cn("mt-2 line-clamp-2 text-sm text-muted-foreground")}>{hit.body}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/each}

      {#if data.pagination.hasMore}
        <form method="GET">
          <input type="hidden" name="q" value={data.q} />
          <input type="hidden" name="page" value={data.pagination.page + 1} />
          <button
            data-load-more
            type="submit"
            class={cn("border-input bg-background h-9 rounded-md border px-4 text-sm font-medium shadow-xs hover:bg-accent")}
          >Load more</button>
        </form>
      {/if}
    </div>
  </div>
{/if}
