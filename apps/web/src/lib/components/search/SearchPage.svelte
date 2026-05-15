<script lang="ts">
  /**
   * Full search page: left panel (facets 240px) + right panel (results flex-1).
   * Facet groups: Kind, Project, Status.
   * Tabs: All / Docs / Tasks / Memories / Runs / Artifacts.
   * Saved searches: bookmark icon creates a public API saved search.
   */
  import { onMount } from "svelte";
  import FacetChip from "./FacetChip.svelte";
  import SavedSearchRow from "./SavedSearchRow.svelte";
  import {
    buildSearchFacets,
    filterSearchResults,
    highlightedSegments,
    normalizeSearchHit,
    searchPublicApiHeaders,
    searchPublicApiPath,
    type NormalizedSearchResult,
  } from "./in-context-search";

  // ── Types ──────────────────────────────────────────────────────────────────

  type SearchResult = NormalizedSearchResult;

  interface SearchFacets {
    [group: string]: Record<string, number>;
  }

  interface ActiveFilters {
    kinds: string[];
    projectIds: string[];
    statuses: string[];
    dateRange?: { from?: string; to?: string };
  }

  interface SavedSearch {
    id: string;
    name: string;
    queryJson?: Record<string, unknown>;
  }

  interface SavedSearchRow {
    id: string;
    name: string;
    query_json?: string | Record<string, unknown>;
  }

  interface Props {
    orgId?: string | null;
    userId?: string | null;
    projectId?: string | null;
    apiToken?: string | null;
  }

  type Tab = "all" | "doc" | "task" | "memory" | "run" | "artifact";

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "doc", label: "Docs" },
    { id: "task", label: "Tasks" },
    { id: "memory", label: "Memories" },
    { id: "run", label: "Runs" },
    { id: "artifact", label: "Artifacts" },
  ];

  let {
    orgId = null,
    userId = null,
    projectId = null,
    apiToken = null,
  }: Props = $props();

  // ── State ──────────────────────────────────────────────────────────────────

  let term = $state("");
  let activeTab = $state<Tab>("all");
  let activeFilters = $state<ActiveFilters>({ kinds: [], projectIds: [], statuses: [] });

  let results = $state<SearchResult[]>([]);
  let facets = $state<SearchFacets>({});
  let total = $state(0);
  let loading = $state(false);
  let error = $state("");

  let savedSearches = $state<SavedSearch[]>([]);
  let savingSearch = $state(false);
  let saveError = $state("");

  let searchInput: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeChips = $derived([
    ...activeFilters.kinds.map((k) => ({ label: k, type: "kind" as const, value: k })),
    ...activeFilters.projectIds.map((p) => ({ label: p, type: "project" as const, value: p })),
    ...activeFilters.statuses.map((s) => ({ label: s, type: "status" as const, value: s })),
  ]);

  const visibleResults = $derived(
    filterSearchResults(
      activeTab === "all"
        ? results
        : results.filter((r) => r.entityKind === activeTab),
      { statuses: activeFilters.statuses },
    ),
  );

  function normalizeSavedSearch(row: SavedSearchRow): SavedSearch {
    const queryJson = typeof row.query_json === "string"
      ? parseJsonObject(row.query_json)
      : row.query_json;
    return {
      id: row.id,
      name: row.name,
      ...(queryJson ? { queryJson } : {}),
    };
  }

  function parseJsonObject(value: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async function runServerSearch(): Promise<void> {
    const trimmed = term.trim();
    if (!trimmed) {
      results = [];
      facets = {};
      total = 0;
      loading = false;
      error = "";
      return;
    }
    loading = true;
    error = "";
    try {
      const params: Record<string, string> = {
        q: trimmed,
        limit: "50",
      };
      if (!orgId) throw new Error("Search scope is required.");
      params.org_id = orgId;
      const firstProjectId = activeFilters.projectIds[0] ?? projectId;
      if (firstProjectId) params.project_id = firstProjectId;
      if (activeFilters.kinds.length > 0) params.kind = activeFilters.kinds.join(",");
      const res = await fetch(searchPublicApiPath("/api/v1/search", params), {
        method: "GET",
        credentials: "include",
        headers: searchPublicApiHeaders(apiToken),
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      const nextResults = Array.isArray(data) ? data.map(normalizeSearchHit) : [];
      results = nextResults;
      total = filterSearchResults(nextResults, { statuses: activeFilters.statuses }).length;
      facets = buildSearchFacets(nextResults);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Search failed";
    } finally {
      loading = false;
    }
  }

  function scheduleSearch(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void runServerSearch(); }, 250);
  }

  function onTermInput(e: Event): void {
    term = (e.currentTarget as HTMLInputElement).value;
    scheduleSearch();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      term = "";
      results = [];
      facets = {};
      total = 0;
    }
  }

  // ── Facet toggles ──────────────────────────────────────────────────────────

  function toggleKind(kind: string): void {
    activeFilters = {
      ...activeFilters,
      kinds: activeFilters.kinds.includes(kind)
        ? activeFilters.kinds.filter((k) => k !== kind)
        : [...activeFilters.kinds, kind],
    };
    scheduleSearch();
  }

  function toggleProject(pid: string): void {
    activeFilters = {
      ...activeFilters,
      projectIds: activeFilters.projectIds.includes(pid)
        ? activeFilters.projectIds.filter((p) => p !== pid)
        : [...activeFilters.projectIds, pid],
    };
    scheduleSearch();
  }

  function toggleStatus(status: string): void {
    activeFilters = {
      ...activeFilters,
      statuses: activeFilters.statuses.includes(status)
        ? activeFilters.statuses.filter((s) => s !== status)
        : [...activeFilters.statuses, status],
    };
    scheduleSearch();
  }

  function removeChip(chip: { type: "kind" | "project" | "status"; value: string }): void {
    if (chip.type === "kind") activeFilters = { ...activeFilters, kinds: activeFilters.kinds.filter((k) => k !== chip.value) };
    if (chip.type === "project") activeFilters = { ...activeFilters, projectIds: activeFilters.projectIds.filter((p) => p !== chip.value) };
    if (chip.type === "status") activeFilters = { ...activeFilters, statuses: activeFilters.statuses.filter((s) => s !== chip.value) };
    scheduleSearch();
  }

  // ── Saved searches ─────────────────────────────────────────────────────────

  async function loadSavedSearches(): Promise<void> {
    try {
      if (!orgId || !userId) return;
      const res = await fetch(searchPublicApiPath("/api/v1/search/saved", { org_id: orgId, user_id: userId }), {
        method: "GET",
        credentials: "include",
        headers: searchPublicApiHeaders(apiToken),
      });
      if (!res.ok) return;
      const data = await res.json();
      savedSearches = Array.isArray(data) ? data.map(normalizeSavedSearch) : [];
    } catch {
      // Non-critical; search remains usable without saved rows.
    }
  }

  async function saveSearch(): Promise<void> {
    const name = window.prompt("Save search as:");
    if (!name) return;
    savingSearch = true;
    saveError = "";
    try {
      if (!orgId || !userId) throw new Error("Saved search scope is required.");
      const res = await fetch("/api/v1/search/saved", {
        method: "POST",
        credentials: "include",
        headers: searchPublicApiHeaders(apiToken),
        body: JSON.stringify({
          org_id: orgId,
          user_id: userId,
          name,
          query_json: { term, filters: activeFilters },
          scope: "private",
          ...(projectId ? { project_id: projectId } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const created = normalizeSavedSearch(await res.json());
      if (created?.id) savedSearches = [...savedSearches, created];
    } catch (cause) {
      saveError = cause instanceof Error ? cause.message : "Save failed";
    } finally {
      savingSearch = false;
    }
  }

  function loadSavedSearch(s: SavedSearch): void {
    const q = s.queryJson as { term?: string; filters?: ActiveFilters } | undefined;
    term = q?.term ?? "";
    if (q?.filters) activeFilters = q.filters;
    scheduleSearch();
  }

  function onSearchDeleted(id: string): void {
    savedSearches = savedSearches.filter((s) => s.id !== id);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(() => {
    void loadSavedSearches();
  });

  function formatTimestamp(val: unknown): string {
    if (!val) return "";
    try {
      return new Date(val as string).toLocaleDateString();
    } catch {
      return "";
    }
  }
</script>

<div data-search-page class="flex h-full min-h-0">
  <!-- Left panel: facets + saved searches (240px) -->
  <aside
    data-search-facets
    class="w-60 shrink-0 border-r border-border overflow-y-auto flex flex-col gap-6 px-4 py-5"
  >
    <!-- Saved searches -->
    {#if savedSearches.length > 0}
      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Saved Searches
        </h3>
        <div class="flex flex-col">
          {#each savedSearches as s (s.id)}
            <SavedSearchRow
              search={s}
              orgId={orgId}
              userId={userId}
              apiToken={apiToken}
              onLoad={loadSavedSearch}
              onDeleted={onSearchDeleted}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Facet: Kind -->
    {#if facets["kind"] && Object.keys(facets["kind"]).length > 0}
      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Kind
        </h3>
        <div class="flex flex-col gap-1">
          {#each Object.entries(facets["kind"]) as [kind, count] (kind)}
            <label class="flex items-center justify-between gap-2 cursor-pointer text-sm">
              <span class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeFilters.kinds.includes(kind)}
                  onchange={() => toggleKind(kind)}
                  class="rounded border-input"
                />
                {kind}
              </span>
              <span class="text-xs text-muted-foreground">{count}</span>
            </label>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Facet: Project -->
    {#if facets["project"] && Object.keys(facets["project"]).length > 0}
      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Project
        </h3>
        <div class="flex flex-col gap-1">
          {#each Object.entries(facets["project"]) as [pid, count] (pid)}
            <label class="flex items-center justify-between gap-2 cursor-pointer text-sm">
              <span class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeFilters.projectIds.includes(pid)}
                  onchange={() => toggleProject(pid)}
                  class="rounded border-input"
                />
                {pid}
              </span>
              <span class="text-xs text-muted-foreground">{count}</span>
            </label>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Facet: Status -->
    {#if facets["status"] && Object.keys(facets["status"]).length > 0}
      <section>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </h3>
        <div class="flex flex-col gap-1">
          {#each Object.entries(facets["status"]) as [status, count] (status)}
            <label class="flex items-center justify-between gap-2 cursor-pointer text-sm">
              <span class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeFilters.statuses.includes(status)}
                  onchange={() => toggleStatus(status)}
                  class="rounded border-input"
                />
                {status}
              </span>
              <span class="text-xs text-muted-foreground">{count}</span>
            </label>
          {/each}
        </div>
      </section>
    {/if}
  </aside>

  <!-- Right panel: search input + results -->
  <div class="flex flex-1 flex-col min-w-0">
    <!-- Search input row -->
    <div class="border-b border-border px-5 py-3">
      <div class="relative flex items-center gap-2">
        <!-- Search icon -->
        <span class="pointer-events-none absolute left-3 text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
        <input
          bind:this={searchInput}
          data-search-input
          type="search"
          placeholder="Search everything…"
          value={term}
          oninput={onTermInput}
          onkeydown={onKeydown}
          class="h-12 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <!-- Bookmark / save -->
        <button
          data-save-search
          type="button"
          disabled={savingSearch || !term.trim()}
          onclick={saveSearch}
          title="Save search"
          class="absolute right-3 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"></path>
          </svg>
        </button>
      </div>

      {#if saveError}
        <p class="mt-1 text-xs text-destructive">{saveError}</p>
      {/if}

      <!-- Active filter chips -->
      {#if activeChips.length > 0}
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each activeChips as chip (chip.type + chip.value)}
            <FacetChip
              label={chip.label}
              active={true}
              onClick={() => removeChip(chip)}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="border-b border-border px-5">
      <nav class="flex gap-0" role="tablist">
        {#each TABS as tab (tab.id)}
          <button
            data-tab={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            type="button"
            onclick={() => (activeTab = tab.id)}
            class={[
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {tab.label}
          </button>
        {/each}
      </nav>
    </div>

    <!-- Results -->
    <div class="flex-1 overflow-y-auto px-5 py-3">
      {#if loading}
        <div class="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Searching…
        </div>
      {:else if error}
        <div class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      {:else if !term.trim()}
        <!-- No query empty state -->
        <div data-empty-no-query class="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/50">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <p class="text-sm font-medium text-foreground">Search across everything</p>
          <p class="text-sm text-muted-foreground">Docs, tasks, memories, runs, and artifacts.</p>
        </div>
      {:else if visibleResults.length === 0}
        <!-- No results empty state -->
        <div data-empty-no-results class="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <p class="text-sm font-medium text-foreground">No results for "{term}"</p>
          <p class="text-sm text-muted-foreground">Try a different query or remove filters.</p>
        </div>
      {:else}
        <div class="flex flex-col">
          {#each visibleResults as result (result.id)}
            <div
              data-result-row
              data-entity-kind={result.entityKind}
              data-entity-id={result.entityId}
              class="flex h-[72px] items-start gap-3 border-b border-border last:border-0 py-3 px-1 hover:bg-muted/30 transition-colors cursor-pointer rounded-sm"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <span
                    class="text-[14px] font-semibold leading-snug text-foreground truncate"
                  >
                    {#each highlightedSegments(result.title ?? result.entityId, term) as segment}
                      {#if segment.match}
                        <mark class="text-primary bg-transparent font-medium">{segment.text}</mark>
                      {:else}
                        {segment.text}
                      {/if}
                    {/each}
                  </span>
                  <span class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-secondary text-secondary-foreground border border-border">
                    {result.entityKind}
                  </span>
                </div>
                <p
                  class="text-[14px] font-normal text-muted-foreground truncate"
                >
                  {#each highlightedSegments(result.snippet || (result.body ?? ""), term) as segment}
                    {#if segment.match}
                      <mark class="text-primary bg-transparent font-medium">{segment.text}</mark>
                    {:else}
                      {segment.text}
                    {/if}
                  {/each}
                </p>
              </div>
              <span class="shrink-0 text-xs text-muted-foreground mt-0.5">
                {formatTimestamp(result.metadata?.["updatedAt"] ?? result.metadata?.["createdAt"])}
              </span>
            </div>
          {/each}

          {#if total > visibleResults.length}
            <p class="py-3 text-center text-xs text-muted-foreground">
              Showing {visibleResults.length} of {total} results
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
