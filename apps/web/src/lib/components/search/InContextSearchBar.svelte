<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";
  import {
    appendFacetToken,
    buildSearchFacetCounts,
    buildSearchQueryInput,
    searchPublicApiHeaders,
    searchPublicApiPath,
    type InContextSearchKind,
    type SearchFacetCounts,
  } from "./in-context-search";

  interface Props {
    kind: InContextSearchKind;
    projectId?: string | null;
    orgId?: string | null;
    apiToken?: string | null;
    placeholder?: string;
    initialValue?: string;
    facetCounts?: SearchFacetCounts;
  }

  let {
    kind,
    projectId = null,
    orgId = null,
    apiToken = null,
    placeholder = "Search",
    initialValue = "",
    facetCounts = {},
  }: Props = $props();

  let value = $state(initialValue);
  let activeFacetCounts = $state<SearchFacetCounts>(facetCounts);
  let pending = $state(false);
  let error = $state("");
  const queryInput = $derived(buildSearchQueryInput({ kind, projectId, value }));
  const facetEntries = $derived(
    Object.entries(activeFacetCounts).flatMap(([facet, counts]) =>
      Object.entries(counts).map(([token, count]) => ({ facet, token, count })),
    ),
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function searchPath(): string {
    if (!orgId) throw new Error("Search scope is required.");
    return searchPublicApiPath("/api/v1/search", {
      q: queryInput.q,
      org_id: orgId,
      kind: queryInput.kind,
      limit: queryInput.limit,
      project_id: projectId,
    });
  }

  async function runSearch(): Promise<void> {
    const trimmed = value.trim();
    if (trimmed === "") {
      activeFacetCounts = facetCounts;
      error = "";
      return;
    }

    pending = true;
    error = "";
    try {
      const response = await fetch(searchPath(), {
        method: "GET",
        credentials: "include",
        headers: searchPublicApiHeaders(apiToken),
      });
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const result = await response.json();
      const rows = Array.isArray(result) ? result : [];
      activeFacetCounts = buildSearchFacetCounts(rows);
      dispatchEvent(new CustomEvent("fulcrum:in-context-search", { detail: { input: queryInput, result: rows } }));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Search failed";
    } finally {
      pending = false;
    }
  }

  function onInput(event: Event): void {
    value = (event.currentTarget as HTMLInputElement).value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSearch(), 150);
  }

  function clearSearch(): void {
    value = "";
    activeFacetCounts = facetCounts;
    error = "";
    dispatchEvent(new CustomEvent("fulcrum:in-context-search-clear", { detail: { kind, projectId } }));
  }

  function addFacet(facet: string, token: string): void {
    value = appendFacetToken(value, facet, token);
    void runSearch();
  }
</script>

<section
  data-in-context-search
  data-search-kind={kind}
  data-search-project-id={projectId ?? ""}
  class={cn("flex flex-col gap-2")}
>
  <div class={cn("flex flex-wrap items-center gap-2")}>
    <input
      data-search-input
      type="search"
      name="q"
      aria-label={placeholder}
      {placeholder}
      value={value}
      oninput={onInput}
      class={cn(
        "border-input bg-background placeholder:text-muted-foreground flex h-9 w-full max-w-sm rounded-md border px-3 py-1 text-sm shadow-xs",
      )}
    />
    <button
      data-search-clear
      type="button"
      onclick={clearSearch}
      class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm font-medium shadow-xs hover:bg-accent")}
    >Clear</button>
    {#if pending}
      <span data-search-pending class={cn("text-xs text-muted-foreground")}>Searching</span>
    {/if}
  </div>

  <div data-search-facets class={cn("flex flex-wrap gap-2")}>
    {#each facetEntries as facet (`${facet.facet}:${facet.token}`)}
      <button
        type="button"
        data-search-facet
        data-facet={facet.facet}
        data-facet-value={facet.token}
        onclick={() => addFacet(facet.facet, facet.token)}
        class={cn("rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent")}
      >{facet.facet}: {facet.token} ({facet.count})</button>
    {/each}
  </div>

  {#if error}
    <p data-search-error class={cn("text-xs text-destructive")}>{error}</p>
  {/if}
</section>
