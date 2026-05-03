<script lang="ts">
  import { parseQuickFilter } from "../../../../../search/quick-filter-parser";
  import { cn } from "$lib/utils.js";

  import { filterAndSort, type CommandItem } from "./command-palette-filter";
  import { makeKeydownHandler, makeSelect } from "./command-palette-handlers";
  import { CmdkPaletteCache, type CmdkCommand, type CmdkSearchClient, type CmdkSearchResult } from "./cmdk-palette";

  interface Props {
    items?: CommandItem[];
    open: boolean;
    onOpenChange: (next: boolean) => void;
    onSelect?: (item: CommandItem) => void;
    searchClient?: CmdkSearchClient;
    commands?: CmdkCommand[];
    onNavigate?: (href: string, options?: { newTab?: boolean }) => void;
    onTaskCreate?: () => void;
    orgId?: string;
  }

  let {
    items = [],
    open,
    onOpenChange,
    onSelect = () => {},
    searchClient,
    commands = [],
    onNavigate = () => {},
    onTaskCreate = () => {},
    orgId = "org-search",
  }: Props = $props();

  let query = $state("");
  let activeIndex = $state(0);
  let searchResults = $state<CmdkSearchResult[]>([]);
  const cache = new CmdkPaletteCache();

  const commandMode = $derived(query.trimStart().startsWith(">"));
  const commandQuery = $derived(query.trimStart().slice(1).trim());
  const visibleCommands = $derived(
    commands.filter((command) => {
      if (commandQuery === "") return true;
      return command.name.includes(commandQuery) || command.label.toLowerCase().includes(commandQuery.toLowerCase());
    }),
  );
  const legacyItems = $derived(filterAndSort(items, query));
  const groupedResults = $derived(groupByKind(searchResults));

  function groupByKind(results: CmdkSearchResult[]) {
    const groups = new Map<string, CmdkSearchResult[]>();
    for (const result of results) {
      const key = result.kind;
      groups.set(key, [...(groups.get(key) ?? []), result]);
    }
    return [...groups.entries()].map(([kind, rows]) => ({ kind, label: groupLabel(kind), rows }));
  }

  function groupLabel(kind: string) {
    if (kind === "doc") return "Docs";
    if (kind === "task") return "Tasks";
    return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}s`;
  }

  function resultAge(value: CmdkSearchResult["updatedAt"]) {
    if (!value) return "";
    const updatedAt = value instanceof Date ? value : new Date(value);
    const days = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000));
    if (days === 0) return "today";
    if (days === 1) return "1d";
    return `${days}d`;
  }

  function selectLegacy(item: CommandItem) {
    onSelect(item);
    onOpenChange(false);
  }

  function selectTopLegacy() {
    makeSelect(items, query, onSelect, onOpenChange)();
  }

  function runCommand(command: CmdkCommand) {
    command.handler();
    if (command.name === "create-task") onTaskCreate();
    onOpenChange(false);
  }

  function openResult(result: CmdkSearchResult, options?: { newTab?: boolean }) {
    onNavigate(result.href, options);
    onOpenChange(false);
  }

  function currentControls(): HTMLElement[] {
    if (typeof document === "undefined") return [];
    return [...document.querySelectorAll<HTMLElement>("[data-cmdk-focusable]")].filter(
      (element) => !element.hasAttribute("disabled"),
    );
  }

  function focusByOffset(offset: number) {
    const controls = currentControls();
    if (controls.length === 0) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const start = current === -1 ? 0 : current;
    const next = (start + offset + controls.length) % controls.length;
    controls[next]?.focus();
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (open && event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      focusByOffset(event.shiftKey ? -1 : 1);
      return;
    }
    makeKeydownHandler(open, onOpenChange)(event);
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commandMode) {
        const first = visibleCommands[0];
        if (first) runCommand(first);
        return;
      }
      const firstResult = searchResults[0];
      if (firstResult) {
        openResult(firstResult, { newTab: event.metaKey || event.ctrlKey });
        return;
      }
      selectTopLegacy();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex += 1;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
    }
    if (event.key === "Tab") {
      event.preventDefault();
      focusByOffset(event.shiftKey ? -1 : 1);
    }
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", handleDocumentKeydown);
    return () => window.removeEventListener("keydown", handleDocumentKeydown);
  });

  $effect(() => {
    if (!open || !searchClient || commandMode) return;
    const parsed = parseQuickFilter(query);
    const cleanQuery = parsed.cleanQuery.trim();
    if (cleanQuery === "" && Object.keys(parsed.filters).length === 0) {
      searchResults = [];
      return;
    }

    const timer = window.setTimeout(() => {
      void cache
        .query(
          {
            orgId,
            q: cleanQuery,
            kind: parsed.filters.kind,
            status: parsed.filters.status,
            tags: parsed.filters.tags,
          },
          () =>
            searchClient.query({
              orgId,
              q: cleanQuery,
              kind: parsed.filters.kind,
              status: parsed.filters.status,
              tags: parsed.filters.tags,
            }),
        )
        .then((output) => {
          searchResults = output.results;
        });
    }, 150);

    return () => window.clearTimeout(timer);
  });
</script>

<svelte:document onkeydown={handleDocumentKeydown} />

<div data-command-palette data-state={open ? "open" : "closed"}>
  {#if open}
    <div class={cn("fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm")}>
      <div
        role="dialog"
        aria-modal="true"
        class={cn(
          "mx-auto mt-16 max-w-xl overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
        )}
      >
        <input
          data-command-palette-input
          data-cmdk-focusable
          type="text"
          bind:value={query}
          onkeydown={handleInputKeydown}
          class={cn(
            "h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none",
            "placeholder:text-muted-foreground",
          )}
          aria-label="Search Fulcrum"
          placeholder="Search or type >"
        />

        {#if commandMode}
          <section class={cn("p-1")}>
            <h2 class={cn("px-2 py-1 text-xs font-medium text-muted-foreground")}>Commands</h2>
            {#each visibleCommands as command (command.name)}
              <button
                data-command-palette-command
                data-cmdk-focusable
                type="button"
                onclick={() => runCommand(command)}
                class={cn(
                  "flex h-9 w-full items-center rounded-md px-2 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {command.label}
              </button>
            {/each}
          </section>
        {:else if searchClient}
          <div data-command-palette-list class={cn("max-h-80 overflow-y-auto p-1")}>
            {#each groupedResults as group (group.kind)}
              <section>
                <h2 class={cn("px-2 py-1 text-xs font-medium text-muted-foreground")}>{group.label}</h2>
                {#each group.rows as result (result.id)}
                  <button
                    data-command-palette-item
                    data-id={result.id}
                    data-cmdk-focusable
                    type="button"
                    onclick={() => openResult(result)}
                    class={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span class={cn("w-5 text-center text-xs uppercase text-muted-foreground")}>{result.kind.slice(0, 1)}</span>
                    <span class={cn("min-w-0 flex-1")}>
                      <span class={cn("block truncate")}>{result.title}</span>
                      {#if result.breadcrumb}
                        <span class={cn("block truncate text-xs text-muted-foreground")}>{result.breadcrumb}</span>
                      {/if}
                    </span>
                    {#if result.badge}
                      <span class={cn("rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground")}>
                        {result.badge}
                      </span>
                    {/if}
                    {#if result.updatedAt}
                      <span class={cn("text-xs text-muted-foreground")}>{resultAge(result.updatedAt)}</span>
                    {/if}
                  </button>
                {/each}
              </section>
            {/each}
          </div>
        {:else}
          <ul data-command-palette-list class={cn("max-h-72 overflow-y-auto p-1")}>
            {#each legacyItems as item (item.id)}
              <li data-command-palette-item data-id={item.id}>
                <button
                  data-cmdk-focusable
                  type="button"
                  onclick={() => selectLegacy(item)}
                  class={cn(
                    "flex h-9 w-full items-center rounded-md px-2 text-left text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item.label}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</div>
