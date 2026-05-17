<script lang="ts">
  import { searchPublicApiHeaders, searchPublicApiPath } from "./in-context-search";

  /**
   * Row for a single saved search with load and delete actions.
   * Delete: inline undo toast (5s).
   */

  interface SavedSearch {
    id: string;
    name: string;
    queryJson?: Record<string, unknown>;
  }

  interface Props {
    search: SavedSearch;
    orgId?: string | null;
    userId?: string | null;
    apiToken?: string | null;
    onLoad?: (search: SavedSearch) => void;
    onDeleted?: (id: string) => void;
  }

  let { search, orgId = null, userId = null, apiToken = null, onLoad, onDeleted }: Props = $props();

  let pendingDelete = $state(false);
  let undoTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let deleting = $state(false);
  let error = $state("");

  function requestDelete(): void {
    pendingDelete = true;
    undoTimer = setTimeout(() => {
      void commitDelete();
    }, 5000);
  }

  function undoDelete(): void {
    pendingDelete = false;
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null;
  }

  async function commitDelete(): Promise<void> {
    if (!pendingDelete) return;
    deleting = true;
    error = "";
    try {
      if (!orgId || !userId) throw new Error("Saved search scope is required.");
      const path = `/api/v1/search/saved/${encodeURIComponent(search.id)}`;
      const res = await fetch(searchPublicApiPath(path, { org_id: orgId, user_id: userId }), {
        method: "DELETE",
        credentials: "include",
        headers: searchPublicApiHeaders(apiToken),
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      onDeleted?.(search.id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Delete failed";
      pendingDelete = false;
    } finally {
      deleting = false;
    }
  }
</script>

<div
  data-saved-search-row
  data-search-id={search.id}
  class="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-muted/40 transition-colors"
>
  {#if pendingDelete}
    <span class="text-sm text-muted-foreground flex-1">
      Saved search deleted.
      <button
        data-undo-delete
        type="button"
        onclick={undoDelete}
        class="ml-1 font-medium text-primary hover:underline"
      >
        Undo
      </button>
    </span>
  {:else}
    <button
      data-load-search
      type="button"
      onclick={() => onLoad?.(search)}
      class="flex-1 text-left text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
    >
      {search.name}
    </button>
    <button
      data-delete-search
      type="button"
      disabled={deleting}
      onclick={requestDelete}
      class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      aria-label="Delete saved search"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path>
        <path d="M10 11v6M14 11v6"></path>
        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path>
      </svg>
    </button>
  {/if}
  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}
</div>
