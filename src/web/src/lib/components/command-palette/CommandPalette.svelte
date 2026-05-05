<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { selectedTaskIds } from "$lib/stores/selection.ts";
  import { oramaIndex } from "$lib/search/OramaIndex.ts";
  import {
    NAVIGATION_COMMANDS,
    CREATION_COMMANDS,
    BULK_COMMANDS,
    type PaletteCommand,
  } from "./navigation-commands.ts";
  import { filterAndSort, type CommandItem } from "./command-palette-filter";
  import { makeSelect } from "./command-palette-handlers";

  interface SearchHit {
    id: string;
    score: number;
    document: {
      title: string;
      body: string;
      kind: string;
      project: string;
      status: string;
      entityId: string;
    };
  }

  interface Props {
    items?: CommandItem[];
    open: boolean;
    onOpenChange: (next: boolean) => void;
    onSelect: (item: CommandItem) => void;
  }

  let { items = [], open, onOpenChange, onSelect }: Props = $props();
  let query = $state("");
  let searchHits = $state<SearchHit[]>([]);
  let searchPending = $state(false);

  // ── Selection store ──────────────────────────────────────────────────────────
  let hasSelection = $state(false);
  selectedTaskIds.subscribe((ids) => {
    hasSelection = ids.length > 0;
  });

  // ── Visible command sections ─────────────────────────────────────────────────
  const navCommands = $derived(filterCommands(NAVIGATION_COMMANDS, query));
  const createCommands = $derived(filterCommands(CREATION_COMMANDS, query));
  const bulkCommands = $derived(
    hasSelection ? filterCommands(BULK_COMMANDS, query) : [],
  );

  // ── Search mode (2+ chars) ───────────────────────────────────────────────────
  const isSearchMode = $derived(query.trim().length >= 2);

  $effect(() => {
    if (!isSearchMode) {
      searchHits = [];
      return;
    }
    if (!oramaIndex.ready) return;
    searchPending = true;
    oramaIndex.search(query.trim(), { limit: 10 }).then((result) => {
      searchHits = (result.hits ?? []) as SearchHit[];
      searchPending = false;
    }).catch(() => {
      searchHits = [];
      searchPending = false;
    });
  });

  // ── Legacy items fallback (backward compat with layout.svelte paletteItems) ──
  const legacyFiltered = $derived(
    items.length > 0 ? filterAndSort(items, query) : [],
  );

  // ── Keyboard nav ─────────────────────────────────────────────────────────────
  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    makeSelect(items, query, onSelect, onOpenChange)();
  }

  function selectCommand(cmd: PaletteCommand) {
    cmd.action?.();
    onOpenChange(false);
  }

  function selectSearchHit(hit: SearchHit) {
    // Navigate to entity — dispatch as generic item
    onSelect({ id: hit.document.entityId, label: hit.document.title });
    onOpenChange(false);
  }

  function selectLegacyItem(item: CommandItem) {
    onSelect(item);
    onOpenChange(false);
  }

  // ── Helper: fuzzy filter command list ────────────────────────────────────────
  function filterCommands(cmds: PaletteCommand[], q: string): PaletteCommand[] {
    if (!q.trim()) return cmds;
    const lower = q.toLowerCase();
    return cmds.filter((c) => c.label.toLowerCase().includes(lower));
  }
</script>

<div data-command-palette data-state={open ? "open" : "closed"}>
  {#if open}
    <div class={cn("fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm")}>
      <div
        class={cn(
          "mx-auto mt-16 max-w-lg overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
        )}
      >
        <!-- Input -->
        <input
          data-command-palette-input
          type="text"
          bind:value={query}
          onkeydown={handleInputKeydown}
          class={cn(
            "h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none",
            "placeholder:text-muted-foreground",
          )}
          aria-label="Command search"
          placeholder="Search commands or type to search…"
        />

        <!-- List -->
        <div data-command-palette-list class={cn("max-h-96 overflow-y-auto p-1")}>

          <!-- Navigation section -->
          {#if navCommands.length > 0}
            <div
              data-section="Navigation"
              class={cn("px-2 py-1 text-xs font-normal text-muted-foreground")}
            >Navigation</div>
            {#each navCommands as cmd (cmd.id)}
              <button
                type="button"
                data-command-palette-item
                data-id={cmd.id}
                onclick={() => selectCommand(cmd)}
                class={cn(
                  "flex h-11 w-full items-center rounded-md px-3 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {cmd.label}
              </button>
            {/each}
          {/if}

          <!-- Create section -->
          {#if createCommands.length > 0}
            <div
              data-section="Create"
              class={cn("px-2 py-1 text-xs font-normal text-muted-foreground", navCommands.length > 0 && "mt-1")}
            >Create</div>
            {#each createCommands as cmd (cmd.id)}
              <button
                type="button"
                data-command-palette-item
                data-id={cmd.id}
                onclick={() => selectCommand(cmd)}
                class={cn(
                  "flex h-11 w-full items-center rounded-md px-3 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {cmd.label}
              </button>
            {/each}
          {/if}

          <!-- Bulk Actions section (conditional on selection) -->
          {#if bulkCommands.length > 0}
            <div
              data-section="Bulk Actions"
              class={cn("mt-1 px-2 py-1 text-xs font-normal text-muted-foreground")}
            >Bulk Actions</div>
            {#each bulkCommands as cmd (cmd.id)}
              <button
                type="button"
                data-command-palette-item
                data-id={cmd.id}
                onclick={() => selectCommand(cmd)}
                class={cn(
                  "flex h-11 w-full items-center rounded-md px-3 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {cmd.label}
              </button>
            {/each}
          {/if}

          <!-- Legacy items (backward compat) -->
          {#if legacyFiltered.length > 0 && NAVIGATION_COMMANDS.length === 0}
            {#each legacyFiltered as item (item.id)}
              <button
                type="button"
                data-command-palette-item
                data-id={item.id}
                onclick={() => selectLegacyItem(item)}
                class={cn(
                  "flex h-11 w-full items-center rounded-md px-3 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {item.label}
              </button>
            {/each}
          {/if}

          <!-- Search Results section (when 2+ chars typed) -->
          {#if isSearchMode}
            <div
              data-section="Search Results"
              class={cn("mt-1 px-2 py-1 text-xs font-normal text-muted-foreground")}
            >Search Results</div>
            {#if searchPending}
              <div class={cn("px-3 py-2 text-sm text-muted-foreground")}>Searching…</div>
            {:else if searchHits.length === 0}
              <div class={cn("px-3 py-2 text-sm text-muted-foreground")}>No results</div>
            {:else}
              {#each searchHits as hit (hit.id)}
                <button
                  type="button"
                  data-command-palette-item
                  data-id={hit.id}
                  onclick={() => selectSearchHit(hit)}
                  class={cn(
                    "flex h-11 w-full flex-col items-start justify-center rounded-md px-3 text-left",
                    "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span class="text-sm leading-tight">{hit.document.title || hit.document.entityId}</span>
                  <span class="text-xs text-muted-foreground">{hit.document.kind}</span>
                </button>
              {/each}
            {/if}
          {/if}

        </div>
      </div>
    </div>
  {/if}
</div>
