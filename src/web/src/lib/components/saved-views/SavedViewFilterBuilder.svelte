<script lang="ts">
  import { cn } from "$lib/utils.js";
  import {
    encodeSavedViewFormValue,
    filterChipLabel,
    savedViewHref,
    type SavedViewQuery,
    type SavedViewScope,
    type SavedViewType,
  } from "./saved-view-query";

  interface SavedViewSummary {
    id: string;
    name: string;
    scope: SavedViewScope;
    viewType: SavedViewType;
    queryJson: SavedViewQuery;
    defaultFor: string | null;
  }

  interface Props {
    projectId: string;
    activeView: SavedViewType;
    query: SavedViewQuery;
    savedViews?: SavedViewSummary[];
  }

  const { projectId, activeView, query, savedViews = [] }: Props = $props();
  const encodedQuery = $derived(encodeSavedViewFormValue(query));
</script>

<section data-saved-view-filter-builder class={cn("flex flex-col gap-3 border-b border-border pb-3")}>
  <div class={cn("flex flex-wrap items-center gap-2")}>
    {#if query.filters.length === 0}
      <span data-filter-chip-empty class={cn("text-sm text-muted-foreground")}>No filters</span>
    {:else}
      {#each query.filters as filter}
        <span data-filter-chip class={cn("rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium")}>
          {filterChipLabel(filter)}
        </span>
      {/each}
    {/if}
    <button
      type="button"
      data-add-filter
      class={cn("h-8 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs")}
    >Add filter</button>
  </div>

  <form method="POST" action="?/savedView" data-save-view-form class={cn("flex flex-wrap items-end gap-2")}>
    <input type="hidden" name="intent" value="savedViews.create" />
    <input type="hidden" name="project_id" value={projectId} />
    <input type="hidden" name="query_json" value={encodedQuery} />
    <label class={cn("flex flex-col gap-1 text-xs font-medium")}>
      Name
      <input
        name="name"
        data-save-view-name
        required
        maxlength="80"
        class={cn("h-8 rounded-md border border-input bg-background px-2 text-sm")}
      />
    </label>
    <label class={cn("flex flex-col gap-1 text-xs font-medium")}>
      Scope
      <select name="scope" data-save-view-scope class={cn("h-8 rounded-md border border-input bg-background px-2 text-sm")}>
        <option value="private">private</option>
        <option value="project">project</option>
        <option value="org">org</option>
      </select>
    </label>
    <label class={cn("flex flex-col gap-1 text-xs font-medium")}>
      Type
      <select name="view_type" data-save-view-type class={cn("h-8 rounded-md border border-input bg-background px-2 text-sm")}>
        {#each ["board", "list", "table", "calendar", "timeline"] as viewType}
          <option value={viewType} selected={activeView === viewType}>{viewType}</option>
        {/each}
      </select>
    </label>
    <button
      type="submit"
      data-save-view-submit
      class={cn("h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs")}
    >Save as view</button>
  </form>

  {#if savedViews.length > 0}
    <nav data-saved-view-list class={cn("flex flex-wrap gap-2")}>
      {#each savedViews as view (view.id)}
        <a
          href={savedViewHref(projectId, view)}
          data-saved-view-link={view.id}
          class={cn("inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted")}
        >
          <span>{view.name}</span>
          <span data-saved-view-scope class={cn("text-muted-foreground")}>{view.scope}</span>
          {#if view.defaultFor}
            <span class={cn("rounded-sm bg-muted px-1 text-[10px] uppercase text-muted-foreground")}>Default</span>
          {/if}
        </a>
      {/each}
    </nav>
  {/if}
</section>
