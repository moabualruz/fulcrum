<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { Breadcrumb, type BreadcrumbItem } from "@fulcrum/ui-kit";
  import type { SavedSearch, SearchHit } from "./+page.server.ts";

  const PROJECT_CONTEXT = {
    id: "proj-fulcrum",
    name: "Fulcrum",
    color: "oklch(0.72 0.16 250)",
    icon: "F",
  };

  const breadcrumb: BreadcrumbItem[] = [
    { label: "Workspace", href: "/" },
    { label: PROJECT_CONTEXT.name, href: `/projects/${PROJECT_CONTEXT.id}` },
    { label: "Search", current: true },
  ];

  interface Props {
    data: {
      q: string;
      kinds: string[];
      dateFrom: string;
      dateTo: string;
      hits: SearchHit[];
      grouped: Record<string, SearchHit[]>;
      savedSearches: SavedSearch[];
    };
  }

  let { data }: Props = $props();

  const ALL_KINDS = ["doc", "task", "run", "artifact", "memory"];

  const groups = $derived(
    Object.entries(data.grouped).filter((entry) => entry[1].length > 0),
  );

  let selectedKinds = $state<string[]>(data.kinds ?? []);
  let dateFrom = $state(data.dateFrom ?? "");
  let dateTo = $state(data.dateTo ?? "");
  let saveSearchName = $state("");
  let showSaveDialog = $state(false);

  function kindsParam(): string {
    return selectedKinds.join(",");
  }

  function toggleKind(k: string) {
    if (selectedKinds.includes(k)) {
      selectedKinds = selectedKinds.filter((s) => s !== k);
    } else {
      selectedKinds = [...selectedKinds, k];
    }
  }

  function hrefFor(hit: SearchHit): string {
    switch (hit.source_kind) {
      case "doc":
        return `/docs/${hit.source_id}`;
      case "task":
        return `/boards?task=${encodeURIComponent(hit.source_id)}`;
      case "run":
        return `/runs/${hit.source_id}`;
      case "artifact":
        return `/artifacts/${hit.source_id}`;
      case "memory":
        return `/memory/${hit.source_id}`;
      default:
        return `/search?q=${encodeURIComponent(data.q)}`;
    }
  }

  function workflowContext(hit: SearchHit): string {
    const body = hit.body.toLowerCase();
    if (body.includes("trace")) return "Trace-linked";
    if (body.includes("source")) return "Source-linked";
    if (body.includes("project")) return "Project context";
    return "Workflow context";
  }

  function formatDate(iso: string): string {
    return iso.slice(0, 10);
  }

  function applyFacets(): void {
    const url = new URL(window.location.href);
    if (data.q) url.searchParams.set("q", data.q);
    const kp = kindsParam();
    if (kp) url.searchParams.set("kinds", kp);
    else url.searchParams.delete("kinds");
    if (dateFrom) url.searchParams.set("date_from", dateFrom);
    else url.searchParams.delete("date_from");
    if (dateTo) url.searchParams.set("date_to", dateTo);
    else url.searchParams.delete("date_to");
    window.location.href = url.toString();
  }

  function loadSavedSearch(ss: SavedSearch): void {
    const url = new URL(window.location.origin + "/search");
    if (ss.params.q) url.searchParams.set("q", ss.params.q);
    if (ss.params.kinds?.length) url.searchParams.set("kinds", ss.params.kinds.join(","));
    if (ss.params.dateFrom) url.searchParams.set("date_from", ss.params.dateFrom);
    if (ss.params.dateTo) url.searchParams.set("date_to", ss.params.dateTo);
    window.location.href = url.toString();
  }
</script>

<header class={cn("mb-4 flex flex-col gap-2 border-b border-border pb-4")}>
  <div data-breadcrumb-row class={cn("flex items-center gap-2")}>
    <span
      data-project-icon
      data-project-id={PROJECT_CONTEXT.id}
      class={cn("inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white")}
      style="background-color: {PROJECT_CONTEXT.color}"
      aria-label={`${PROJECT_CONTEXT.name} project icon`}
    >{PROJECT_CONTEXT.icon}</span>
    <Breadcrumb data-search-breadcrumb items={breadcrumb} />
  </div>
  <div class={cn("flex items-center justify-between gap-4")}>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Search</h1>
  </div>
</header>

<section data-search-fast-actions class={cn("mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3 text-sm")}>
  <span class={cn("font-medium")}>Fast actions</span>
  <a href="/palette" data-search-command-action="open-palette" class={cn("rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent")}>Open command palette</a>
  <a href="/docs/new" data-search-command-action="new-doc" class={cn("rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent")}>New document</a>
  <a href="/runs" data-search-command-action="start-run" class={cn("rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent")}>Start run</a>
</section>

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
  <input type="hidden" name="kinds" value={kindsParam()} />
  <input type="hidden" name="date_from" value={dateFrom} />
  <input type="hidden" name="date_to" value={dateTo} />
  <button
    type="submit"
    class={cn("border-input bg-background h-9 rounded-md border px-4 text-sm font-medium shadow-xs hover:bg-accent")}
  >Search</button>
</form>

<div class={cn("flex flex-col gap-4 md:flex-row")}>
  <!-- Facet rail -->
  <aside data-facet-panel class={cn("w-full shrink-0 space-y-4 text-sm md:w-48")}>
    <div data-facet-kinds>
      <p class={cn("mb-1 font-semibold text-muted-foreground uppercase text-xs")}>Kind</p>
      {#each ALL_KINDS as kind (kind)}
        <label class={cn("flex items-center gap-2 cursor-pointer")}>
          <input
            type="checkbox"
            data-testid="facet-chip"
            data-kind-checkbox={kind}
            checked={selectedKinds.includes(kind)}
            onchange={() => toggleKind(kind)}
          />
          {kind}
        </label>
      {/each}
    </div>

    <div data-facet-date>
      <p class={cn("mb-1 font-semibold text-muted-foreground uppercase text-xs")}>Date range</p>
      <label class={cn("block text-xs mb-1")}>
        From
        <input
          type="date"
          data-date-from
          bind:value={dateFrom}
          class={cn("mt-0.5 block w-full border border-input rounded px-2 py-1 text-xs bg-background")}
        />
      </label>
      <label class={cn("block text-xs")}>
        To
        <input
          type="date"
          data-date-to
          bind:value={dateTo}
          class={cn("mt-0.5 block w-full border border-input rounded px-2 py-1 text-xs bg-background")}
        />
      </label>
    </div>

    <button
      type="button"
      data-apply-facets
      onclick={applyFacets}
      class={cn("w-full rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent")}
    >Apply filters</button>

    {#if data.hits.length > 0 || data.q}
      <button
        type="button"
        data-save-search-btn
        onclick={() => (showSaveDialog = !showSaveDialog)}
        class={cn("w-full rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent")}
      >Save this search</button>

      {#if showSaveDialog}
        <form
          data-save-search-form
          method="POST"
          action="?/saveSearch"
          class={cn("space-y-1")}
        >
          <input type="hidden" name="q" value={data.q} />
          <input type="hidden" name="kinds" value={kindsParam()} />
          <input type="hidden" name="date_from" value={dateFrom} />
          <input type="hidden" name="date_to" value={dateTo} />
          <input
            type="text"
            name="name"
            bind:value={saveSearchName}
            placeholder="Search name"
            class={cn("w-full border border-input rounded px-2 py-1 text-xs bg-background")}
          />
          <button
            type="submit"
            class={cn("w-full rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent")}
          >Save</button>
        </form>
      {/if}
    {/if}

    {#if data.savedSearches.length > 0}
      <div data-saved-searches>
        <p class={cn("mb-1 font-semibold text-muted-foreground uppercase text-xs")}>Saved searches</p>
        {#each data.savedSearches as ss (ss.id)}
          <button
            type="button"
            data-saved-search={ss.name}
            onclick={() => loadSavedSearch(ss)}
            class={cn("block w-full text-left truncate rounded px-2 py-0.5 text-xs hover:bg-accent")}
          >{ss.name}</button>
        {/each}
      </div>
    {/if}
  </aside>

  <!-- Results area -->
  <main class={cn("flex-1 min-w-0")}>
    {#if data.q === ""}
      <div
        data-search-no-query
        class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
      >Type to search across docs, tasks, runs, artifacts, memory, and audit.</div>
    {:else if data.hits.length === 0}
      <div
        data-search-empty
        class={cn("space-y-3 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
      >
        <p>No results. Try a trace ID, source file, project name, or fewer words.</p>
        <div class={cn("flex flex-wrap gap-2")}>
          <a href="/palette" data-search-empty-action="palette" class={cn("rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent")}>Open command palette</a>
          <a href="/docs/new" data-search-empty-action="doc" class={cn("rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent")}>Create document</a>
        </div>
      </div>
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
                    <span data-hit-workflow-context>{workflowContext(hit)}</span>
                    <span data-hit-date>{formatDate(hit.updated_at)}</span>
                  </div>
                  <p class={cn("mt-2 line-clamp-2 text-sm text-muted-foreground")}>{hit.body}</p>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/if}
  </main>
</div>
